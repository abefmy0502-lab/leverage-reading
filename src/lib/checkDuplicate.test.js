import { describe, it, expect } from 'vitest';
import { findDuplicateBook, isUniqueViolation } from './checkDuplicate';

const books = [
  { id: '1', title: '1分で話せ', author: '伊藤羊一', isbn: '9784479796855' },
  { id: '2', title: 'エッセンシャル思考', author: 'グレッグ・マキューン', isbn: '' },
];

describe('findDuplicateBook — ISBN matching', () => {
  it('matches the same book across ISBN-10 / ISBN-13 forms', () => {
    // 4479796851 is the ISBN-10 form of 9784479796855
    const hit = findDuplicateBook(books, { isbn: '4479796851', title: '別タイトル' });
    expect(hit?.id).toBe('1');
  });
  it('matches with hyphenated ISBN input', () => {
    const hit = findDuplicateBook(books, { isbn: '978-4-479-79685-5' });
    expect(hit?.id).toBe('1');
  });
  it('returns null when no ISBN matches and title differs', () => {
    expect(findDuplicateBook(books, { isbn: '9999999999999', title: '無関係' })).toBeNull();
  });
});

describe('findDuplicateBook — title/author matching', () => {
  it('matches by normalized title when ISBN is absent', () => {
    const hit = findDuplicateBook(books, { title: 'エッセンシャル思考', author: 'グレッグ・マキューン' });
    expect(hit?.id).toBe('2');
  });
  it('normalizes full-width / half-width and case', () => {
    const hit = findDuplicateBook(books, { title: '１分で話せ' }); // full-width "1"
    expect(hit?.id).toBe('1');
  });
  it('passes when one side has no author', () => {
    const hit = findDuplicateBook(books, { title: 'エッセンシャル思考' });
    expect(hit?.id).toBe('2');
  });
  it('rejects when both authors are present but differ', () => {
    expect(findDuplicateBook(books, { title: 'エッセンシャル思考', author: '別人' })).toBeNull();
  });
  it('returns null for empty title and no ISBN', () => {
    expect(findDuplicateBook(books, { title: '' })).toBeNull();
  });
});

describe('findDuplicateBook — guards', () => {
  it('handles empty book list', () => {
    expect(findDuplicateBook([], { isbn: '9784479796855' })).toBeNull();
  });
  it('handles null candidate', () => {
    expect(findDuplicateBook(books, null)).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  it('detects Postgres 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
  it('detects by message text', () => {
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true);
    expect(isUniqueViolation({ message: 'books_user_isbn_unique' })).toBe(true);
  });
  it('returns false for unrelated errors', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
