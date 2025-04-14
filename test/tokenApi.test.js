const request = require('supertest');
const app = require('../server');
const tokenService = require('../services/tokenService');

// Mock the token service
jest.mock('../services/tokenService');

describe('Token API Endpoints', () => {
  // Setup mock data
  const mockTokens = [
    {
      token_id: '279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b',
      ticker: 'SNEK',
      name: 'Snek Token',
      market_cap: 373645169.495,
      price: 0.004392,
      liquidity: 12345678,
      pool_count: 9,
      trust_score: 120,
      has_market_cap: true,
      rank: 1
    },
    {
      token_id: '123abc',
      ticker: 'TEST',
      name: 'Test Token',
      market_cap: 1000000,
      price: 0.1,
      liquidity: 100000,
      pool_count: 3,
      trust_score: 80,
      has_market_cap: true,
      rank: 2
    }
  ];

  const mockStats = {
    total: 916,
    with_market_cap: 596,
    without_market_cap: 320,
    with_liquidity: 580,
    high_trust: 450,
    timestamp: new Date().toISOString()
  };

  // Setup mocks
  beforeEach(() => {
    tokenService.getAllTokens.mockResolvedValue(mockTokens);
    tokenService.getTopTokens.mockResolvedValue(mockTokens);
    tokenService.getTokenById.mockImplementation((id) => {
      const token = mockTokens.find(t => t.token_id === id);
      return Promise.resolve(token || null);
    });
    tokenService.searchTokens.mockImplementation((query) => {
      const results = mockTokens.filter(t => 
        t.ticker.toLowerCase().includes(query.toLowerCase()) || 
        t.name.toLowerCase().includes(query.toLowerCase())
      );
      return Promise.resolve(results);
    });
    tokenService.getTokenStats.mockResolvedValue(mockStats);
  });

  // Tests
  describe('GET /api/tokens', () => {
    it('should return all tokens', async () => {
      const res = await request(app).get('/api/tokens');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/tokens/top/:limit', () => {
    it('should return top tokens based on limit', async () => {
      const res = await request(app).get('/api/tokens/top/2');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveLength(2);
    });

    it('should handle invalid limit parameter', async () => {
      const res = await request(app).get('/api/tokens/top/invalid');
      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
    });
  });

  describe('GET /api/tokens/:id', () => {
    it('should return a token when given a valid ID', async () => {
      const res = await request(app).get('/api/tokens/279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data.ticker).toEqual('SNEK');
    });

    it('should return 404 for non-existent token ID', async () => {
      const res = await request(app).get('/api/tokens/non-existent-id');
      expect(res.statusCode).toEqual(404);
      expect(res.body.status).toEqual('error');
    });
  });

  describe('GET /api/tokens/search/:query', () => {
    it('should return matching tokens for a search query', async () => {
      const res = await request(app).get('/api/tokens/search/snek');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].ticker).toEqual('SNEK');
    });

    it('should return 400 for empty search query', async () => {
      const res = await request(app).get('/api/tokens/search/');
      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('error');
    });
  });

  describe('GET /api/tokens/stats', () => {
    it('should return token statistics', async () => {
      const res = await request(app).get('/api/tokens/stats');
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('with_market_cap');
    });
  });
}); 