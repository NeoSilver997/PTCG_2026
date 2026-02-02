import { render, screen } from '@testing-library/react';
import DeckBuilderTournamentsPage from '../tournaments/page';

jest.mock('@/components/navbar', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('DeckBuilderTournamentsPage', () => {
  it('renders tournament list UI', () => {
    render(<DeckBuilderTournamentsPage />);

    expect(screen.getByText('賽事牌組')).toBeInTheDocument();
    expect(screen.getByText('2025 香港大師賽')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜尋賽事名稱')).toBeInTheDocument();
  });
});
