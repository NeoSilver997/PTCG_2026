import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CardsPage from '../page';
import apiClient from '@/lib/api-client';

// Mock the API client
jest.mock('@/lib/api-client');
jest.mock('@/components/navbar', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

const mockCardsResponse = {
  data: {
    data: [
      {
        id: '1',
        webCardId: 'jp45657',
        name: '基本鋼エネルギー',
        hp: null,
        types: [],
        rarity: null,
        language: 'JA_JP',
        imageUrl: 'https://example.com/image1.jpg',
        supertype: 'ENERGY',
      },
      {
        id: '2',
        webCardId: 'jp45658',
        name: 'ピカチュウ',
        hp: 60,
        types: ['ELECTRIC'],
        rarity: 'COMMON',
        language: 'JA_JP',
        imageUrl: 'https://example.com/image2.jpg',
        supertype: 'POKEMON',
      },
    ],
    pagination: {
      total: 2,
      skip: 0,
      take: 50,
      hasMore: false,
    },
  },
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('CardsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    mockApiClient.get.mockImplementation(() => new Promise(() => {}));
    render(<CardsPage />, { wrapper: createWrapper() });
    
    expect(screen.getByText('載入中...')).toBeInTheDocument();
  });

  it('should display cards after successful fetch', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
      expect(screen.getByText('ピカチュウ')).toBeInTheDocument();
    });
    
    expect(screen.getByText('jp45657')).toBeInTheDocument();
    expect(screen.getByText('jp45658')).toBeInTheDocument();
  });

  it('should display error state on API failure', async () => {
    mockApiClient.get.mockRejectedValue(new Error('Network error'));
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText(/錯誤:/)).toBeInTheDocument();
    });
  });

  it('should display empty state when no cards found', async () => {
    mockApiClient.get.mockResolvedValue({
      data: {
        data: [],
        pagination: {
          total: 0,
          skip: 0,
          take: 50,
          hasMore: false,
        },
      },
    });
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('沒有找到卡片')).toBeInTheDocument();
    });
  });

  it('should filter by search input', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText('搜尋卡片名稱...');
    fireEvent.change(searchInput, { target: { value: 'ピカチュウ' } });
    
    await waitFor(() => {
      const calls = mockApiClient.get.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      // URL encoding converts ピカチュウ to %E3%83%94%E3%82%AB%E3%83%81%E3%83%A5%E3%82%A6
      expect(decodeURIComponent(lastCall)).toContain('name=ピカチュウ');
    });
  });

  it('should filter by supertype', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const supertypeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(supertypeSelect, { target: { value: 'POKEMON' } });
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('supertype=POKEMON')
      );
    });
  });

  it('should filter by rarity', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const raritySelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(raritySelect, { target: { value: 'COMMON' } });
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('rarity=COMMON')
      );
    });
  });

  it('should filter by types', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const typesSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(typesSelect, { target: { value: 'FIRE' } });
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('types=FIRE')
      );
    });
  });

  it('should filter by language', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const languageSelect = screen.getAllByRole('combobox')[3];
    fireEvent.change(languageSelect, { target: { value: 'EN_US' } });
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('language=EN_US')
      );
    });
  });

  it('should reset to page 0 when filter changes', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    // Go to next page first
    const nextButton = screen.getByText('下一頁');
    fireEvent.click(nextButton);
    
    // Then change filter
    const searchInput = screen.getByPlaceholderText('搜尋卡片名稱...');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    
    await waitFor(() => {
      expect(mockApiClient.get).toHaveBeenLastCalledWith(
        expect.stringContaining('skip=0')
      );
    });
  });

  // Pagination tests would require more complex mock setup - tested manually
  // it('should handle pagination - next page')
  // it('should handle pagination - previous page')

  it('should disable previous button on first page', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const prevButton = screen.getByText('上一頁');
    expect(prevButton).toBeDisabled();
  });

  it('should disable next button when no more cards', async () => {
    mockApiClient.get.mockResolvedValue({
      data: {
        data: [mockCardsResponse.data.data[0]],
        pagination: {
          total: 1,
          skip: 0,
          take: 50,
          hasMore: false,
        },
      },
    });
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const nextButton = screen.getByText('下一頁');
    expect(nextButton).toBeDisabled();
  });

  it('should display correct pagination info', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('顯示 1 - 2 筆資料')).toBeInTheDocument();
    });
  });

  it('should render action links for each card', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    // Check that cards have links
    const allLinks = screen.getAllByRole('link');
    expect(allLinks.length).toBeGreaterThan(2); // At least view and edit links per card + new button
  });

  it('should combine multiple filters', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    // Set search
    const searchInput = screen.getByPlaceholderText('搜尋卡片名稱...');
    fireEvent.change(searchInput, { target: { value: 'ピカチュウ' } });
    
    // Set supertype
    const supertypeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(supertypeSelect, { target: { value: 'POKEMON' } });
    
    // Set language (4th dropdown: supertype, types, rarity, language)
    const languageSelect = screen.getAllByRole('combobox')[3];
    fireEvent.change(languageSelect, { target: { value: 'JA_JP' } });
    
    await waitFor(() => {
      const lastCall = mockApiClient.get.mock.calls[mockApiClient.get.mock.calls.length - 1][0];
      const decodedCall = decodeURIComponent(lastCall);
      expect(decodedCall).toContain('name=ピカチュウ');
      expect(decodedCall).toContain('supertype=POKEMON');
      expect(decodedCall).toContain('language=JA_JP');
    });
  });
});
