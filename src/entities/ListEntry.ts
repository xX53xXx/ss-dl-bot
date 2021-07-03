
export interface ListEntryTag {
    name: string;
    url?: string;
}

export interface ListEntry {
    name: string;
    url: string;
    imageUrl?: string;
    tags: Array<ListEntryTag>;
}