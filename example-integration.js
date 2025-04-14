/**
 * Example integration for the Callers token API
 * This shows how to use the API in your React frontend
 */

// This service would be imported in your React components
const TokenApiService = {
  // Base API URL - adjust for production
  baseUrl: 'http://localhost:3001/api',

  /**
   * Fetch all tokens sorted by market cap
   * @returns {Promise<Array>} Sorted tokens
   */
  async getAllTokens() {
    try {
      const response = await fetch(`${this.baseUrl}/tokens`);
      const result = await response.json();
      
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      
      return result.data;
    } catch (error) {
      console.error('Error fetching all tokens:', error);
      throw error;
    }
  },

  /**
   * Get top N tokens by market cap
   * @param {number} limit - Number of tokens to return
   * @returns {Promise<Array>} Top tokens
   */
  async getTopTokens(limit = 50) {
    try {
      const response = await fetch(`${this.baseUrl}/tokens/top/${limit}`);
      const result = await response.json();
      
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      
      return result.data;
    } catch (error) {
      console.error(`Error fetching top ${limit} tokens:`, error);
      throw error;
    }
  },

  /**
   * Get token by ID
   * @param {string} tokenId - Token ID
   * @returns {Promise<Object>} Token data
   */
  async getTokenById(tokenId) {
    if (!tokenId) {
      throw new Error('Token ID is required');
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/tokens/${tokenId}`);
      const result = await response.json();
      
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      
      return result.data;
    } catch (error) {
      console.error(`Error fetching token ${tokenId}:`, error);
      throw error;
    }
  },

  /**
   * Search for tokens by ticker or name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching tokens
   */
  async searchTokens(query) {
    if (!query || !query.trim()) {
      return [];
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/tokens/search/${query}`);
      const result = await response.json();
      
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      
      return result.data;
    } catch (error) {
      console.error(`Error searching tokens with query "${query}":`, error);
      throw error;
    }
  },

  /**
   * Get token statistics
   * @returns {Promise<Object>} Token statistics
   */
  async getTokenStats() {
    try {
      const response = await fetch(`${this.baseUrl}/tokens/stats`);
      const result = await response.json();
      
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      
      return result.data;
    } catch (error) {
      console.error('Error fetching token statistics:', error);
      throw error;
    }
  }
};

// Example React component using the API service
/*
import React, { useState, useEffect } from 'react';
import TokenApiService from '../services/TokenApiService';

function TokenList() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTokens, setFilteredTokens] = useState([]);

  // Load tokens on component mount
  useEffect(() => {
    async function loadTokens() {
      try {
        setLoading(true);
        // Get top 50 tokens by default
        const data = await TokenApiService.getTopTokens(50);
        setTokens(data);
        setFilteredTokens(data);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    
    loadTokens();
  }, []);

  // Handle search
  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (!query.trim()) {
      setFilteredTokens(tokens);
      return;
    }
    
    try {
      const results = await TokenApiService.searchTokens(query);
      setFilteredTokens(results);
    } catch (err) {
      console.error('Search error:', err);
      // Fall back to client-side filtering if API search fails
      const filtered = tokens.filter(token => 
        token.ticker.toLowerCase().includes(query.toLowerCase()) || 
        (token.name && token.name.toLowerCase().includes(query.toLowerCase()))
      );
      setFilteredTokens(filtered);
    }
  };

  if (loading) return <div>Loading tokens...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="token-list">
      <h2>Token Market Cap Rankings</h2>
      
      <input
        type="text"
        placeholder="Search tokens..."
        value={searchQuery}
        onChange={handleSearch}
        className="search-input"
      />
      
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Token</th>
            <th>Price (ADA)</th>
            <th>Market Cap (ADA)</th>
            <th>Liquidity</th>
          </tr>
        </thead>
        <tbody>
          {filteredTokens.map(token => (
            <tr key={token.token_id}>
              <td>{token.rank}</td>
              <td>{token.ticker}</td>
              <td>{token.price ? token.price.toLocaleString() : '-'}</td>
              <td>{token.market_cap ? token.market_cap.toLocaleString() : '-'}</td>
              <td>{token.liquidity ? token.liquidity.toLocaleString() : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TokenList;
*/

// Export the service for use in React components
module.exports = TokenApiService; 