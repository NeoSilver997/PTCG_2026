import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CardsPage from '../page';
import apiClient from '@/lib/api-client';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(() => null), // Return null by default to simulate no saved filters
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock the API client
jest.mock('@/lib/api-client');
jest.mock('@/components/navbar', () => ({
  Navbar: () => <div data-testid="navbar">Navbar</div>,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
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
        types: null,
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
        types: 'LIGHTNING',
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
    
    expect(screen.queryByText('jp45657')).not.toBeInTheDocument();
    expect(screen.queryByText('jp45658')).not.toBeInTheDocument();
  });

  it('should display error state on API failure', async () => {
    mockApiClient.get.mockRejectedValue(new Error('Network error'));
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('載入失敗')).toBeInTheDocument();
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
      expect(screen.getByText('沒有找到卡牌')).toBeInTheDocument();
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
    
    const supertypeSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(supertypeSelect, { target: { value: 'POKEMON' } });
    
    await waitFor(() => {
      const calls = mockApiClient.get.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      const decodedCall = decodeURIComponent(lastCall);
      expect(decodedCall).toContain('supertype=POKEMON');
      expect(decodedCall).toContain('sortBy=expansionReleaseDate');
      expect(decodedCall).toContain('sortOrder=desc');
    });
  });

  it('should filter by rarity', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const raritySelect = screen.getAllByRole('combobox')[4];
    fireEvent.change(raritySelect, { target: { value: 'COMMON' } });
    
    await waitFor(() => {
      const calls = mockApiClient.get.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      const decodedCall = decodeURIComponent(lastCall);
      expect(decodedCall).toContain('rarity=COMMON');
      expect(decodedCall).toContain('sortBy=expansionReleaseDate');
      expect(decodedCall).toContain('sortOrder=desc');
    });
  });

  it('should filter by types', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const typesSelect = screen.getAllByRole('combobox')[3];
    fireEvent.change(typesSelect, { target: { value: 'FIRE' } });
    
    await waitFor(() => {
      const calls = mockApiClient.get.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      const decodedCall = decodeURIComponent(lastCall);
      expect(decodedCall).toContain('types=FIRE');
      expect(decodedCall).toContain('sortBy=expansionReleaseDate');
      expect(decodedCall).toContain('sortOrder=desc');
    });
  });

  it('should filter by language', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
    });
    
    const languageSelect = screen.getAllByRole('combobox')[5];
    fireEvent.change(languageSelect, { target: { value: 'EN_US' } });
    
    await waitFor(() => {
      const calls = mockApiClient.get.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      const decodedCall = decodeURIComponent(lastCall);
      expect(decodedCall).toContain('language=EN_US');
      expect(decodedCall).toContain('sortBy=expansionReleaseDate');
      expect(decodedCall).toContain('sortOrder=desc');
    });
  });

  it('should display correct pagination info', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('顯示 2 張卡牌 (總共 2 張)')).toBeInTheDocument();
    });
  });

  it('should render cards with correct information', async () => {
    mockApiClient.get.mockResolvedValue(mockCardsResponse);
    
    render(<CardsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('基本鋼エネルギー')).toBeInTheDocument();
      expect(screen.getByText('ピカチュウ')).toBeInTheDocument();
    });
    
    // Check that cards are clickable
    const cards = screen.getAllByRole('img');
    expect(cards).toHaveLength(2);
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
    const supertypeSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(supertypeSelect, { target: { value: 'POKEMON' } });
    
    // Set language (supertype, types, rarity, language)
    const languageSelect = screen.getAllByRole('combobox')[5];
    fireEvent.change(languageSelect, { target: { value: 'JA_JP' } });
    
    await waitFor(() => {
      const lastCall = mockApiClient.get.mock.calls[mockApiClient.get.mock.calls.length - 1][0];
      const decodedCall = decodeURIComponent(lastCall);
      expect(decodedCall).toContain('name=ピカチュウ');
      expect(decodedCall).toContain('supertype=POKEMON');
      expect(decodedCall).toContain('language=JA_JP');
      expect(decodedCall).toContain('sortBy=expansionReleaseDate');
      expect(decodedCall).toContain('sortOrder=desc');
    });
  });
});
