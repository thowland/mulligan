import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ListingImport } from '../src/features/listing/ListingImport.tsx';
import { useListingStore } from '../src/state/listing.ts';

const file = (content: BlobPart, name: string, type = 'text/csv') =>
  new File([content], name, { type });
const picker = () => screen.getByLabelText('Listing template file');

describe('ListingImport', () => {
  it('imports a CSV from the picker and reports the encoding and findings', async () => {
    render(<ListingImport />);
    await userEvent.upload(
      picker(),
      file('field,value\napple.name,Example\nbogus,x\n', 'agency.csv'),
    );
    expect(await screen.findByText('Imported 1 field from agency.csv (UTF-8).')).toBeVisible();
    expect(screen.getByText(/"bogus" is not a listing field/)).toBeVisible();
    expect(useListingStore.getState().inputs['apple.name']).toEqual({ text: 'Example' });
  });

  it('reads Windows-1252 and names it', async () => {
    render(<ListingImport />);
    const bytes = Uint8Array.from([
      ...new TextEncoder().encode('field,value\napple.name,'),
      0x93,
      0x41,
      0x94,
    ]);
    await userEvent.upload(picker(), file(bytes, 'excel.csv'));
    expect(
      await screen.findByText('Imported 1 field from excel.csv (Windows-1252).'),
    ).toBeVisible();
    expect(useListingStore.getState().inputs['apple.name']).toEqual({ text: '“A”' });
  });

  it('asks before replacing copy that is already there, and can cancel', async () => {
    useListingStore.getState().setInput('apple.name', { text: 'Typed' });
    useListingStore.getState().setInput('apple.subtitle', { text: '   ' });
    render(<ListingImport />);
    const json = '{"mulliganTemplate":1,"fields":{"apple.name":"New","apple.subtitle":"Sub"}}';

    await userEvent.upload(picker(), file(json, 'listing.json', 'application/json'));
    const confirm = await screen.findByRole('group', { name: 'Replace existing copy' });
    expect(confirm).toHaveTextContent(
      'listing.json replaces copy already entered in 1 field: App name.',
    );
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(useListingStore.getState().inputs['apple.name']).toEqual({ text: 'Typed' });

    await userEvent.upload(picker(), file(json, 'listing.json', 'application/json'));
    await userEvent.click(
      within(await screen.findByRole('group', { name: 'Replace existing copy' })).getByRole(
        'button',
        { name: 'Replace' },
      ),
    );
    expect(useListingStore.getState().inputs['apple.name']).toEqual({ text: 'New' });
    expect(screen.getByText('Imported 2 fields from listing.json (UTF-8).')).toBeVisible();
  });

  it('reports a file that cannot be imported', async () => {
    render(<ListingImport />);
    await userEvent.upload(picker(), file('nonsense', 'notes.json', 'application/json'));
    expect(
      await screen.findByText('notes.json could not be imported (read as UTF-8).'),
    ).toBeVisible();
    expect(screen.getByText(/not valid JSON/)).toBeVisible();
  });

  it('refuses a file over the size limit without reading it', async () => {
    render(<ListingImport />);
    const big = file('x', 'big.csv');
    Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 });
    await userEvent.upload(picker(), big);
    expect(await screen.findByText('big.csv could not be imported.')).toBeVisible();
    expect(screen.getByText('The file is 2 MB, over the 1 MB import limit.')).toBeVisible();
  });

  it('accepts a dropped file and ignores link drags', async () => {
    render(<ListingImport />);
    const zone = screen.getByRole('region', { name: 'Import from a template' });

    const link = { types: ['text/uri-list'], files: [], dropEffect: 'none' };
    expect(fireEvent.dragOver(zone, { dataTransfer: link })).toBe(true);
    expect(zone).not.toHaveAttribute('data-dragging');
    expect(fireEvent.drop(zone, { dataTransfer: link })).toBe(true);

    const files = {
      types: ['Files'],
      files: [file('field,value\napple.name,Dropped\n', 'd.csv')],
      dropEffect: 'none',
    };
    expect(fireEvent.dragOver(zone, { dataTransfer: files })).toBe(false);
    expect(zone).toHaveAttribute('data-dragging', 'true');
    fireEvent.dragLeave(zone);
    expect(zone).not.toHaveAttribute('data-dragging');
    fireEvent.drop(zone, { dataTransfer: files });
    await waitFor(() =>
      expect(useListingStore.getState().inputs['apple.name']).toEqual({ text: 'Dropped' }),
    );
  });

  it('ignores an empty drop and an empty pick', () => {
    render(<ListingImport />);
    const zone = screen.getByRole('region', { name: 'Import from a template' });
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [] } });
    fireEvent.change(picker(), { target: { files: [] } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens the picker from the button and links both templates', async () => {
    render(<ListingImport />);
    let clicked = false;
    picker().addEventListener('click', () => (clicked = true));
    await userEvent.click(screen.getByRole('button', { name: 'Choose CSV or JSON file' }));
    expect(clicked).toBe(true);
    expect(screen.getByRole('link', { name: 'CSV' })).toHaveAttribute(
      'href',
      '/templates/mulligan-listing-template.csv',
    );
    expect(screen.getByRole('link', { name: 'JSON' })).toHaveAttribute('download');
  });
});
