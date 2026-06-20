import { describe, it, expect } from 'vitest';
import {
  AMAZON_TAG,
  getAmazonLink,
  getAmazonSearchLink,
  AMAZON_LINK_REL,
} from './amazonLink';

describe('getAmazonLink — priority', () => {
  it('prefers ASIN → /dp/ with affiliate tag', () => {
    const url = getAmazonLink({ asin: 'B0ABCD1234', isbn: '9784479796855', title: 'x' });
    expect(url).toContain('/dp/B0ABCD1234');
    expect(url).toContain(`tag=${AMAZON_TAG}`);
  });
  it('falls back to ISBN search when no ASIN', () => {
    const url = getAmazonLink({ isbn: '978-4-479-79685-5', title: 'x' });
    expect(url).toContain('/s?k=9784479796855');
    expect(url).toContain(`tag=${AMAZON_TAG}`);
  });
  it('falls back to title+author search when no identifiers', () => {
    const url = getAmazonLink({ title: '1分で話せ', author: '伊藤羊一' });
    expect(url).toContain('/s?k=');
    expect(url).toContain(`tag=${AMAZON_TAG}`);
  });
  it('returns the base URL for a null book', () => {
    expect(getAmazonLink(null)).toBe('https://www.amazon.co.jp');
  });
});

describe('getAmazonSearchLink', () => {
  it('URL-encodes the query and appends the tag', () => {
    const url = getAmazonSearchLink('A B', 'C');
    expect(url).toContain('k=A%20B%20C');
    expect(url).toContain(`tag=${AMAZON_TAG}`);
  });
  it('returns base URL for empty query', () => {
    expect(getAmazonSearchLink('', '')).toBe('https://www.amazon.co.jp');
  });
});

describe('affiliate link rel', () => {
  it('includes sponsored + noopener for safety/compliance', () => {
    expect(AMAZON_LINK_REL).toContain('sponsored');
    expect(AMAZON_LINK_REL).toContain('noopener');
  });
});
