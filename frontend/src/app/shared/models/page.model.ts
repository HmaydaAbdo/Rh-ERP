/** Une page de résultats telle que le serveur la sérialise (DTO stable : `content` et `page`). */
export interface Page<T> {
  content: T[];
  page: PageInfo;
}

export interface PageInfo {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}
