// Application Configuration
const CONFIG = {
    api: {
        key: '0a7f3e9406msh5385ead16268ba6p196e5ejsn196d4ea2ccb2',
        baseUrl: 'https://twitter-api45.p.rapidapi.com',
        endpoint: '/search.php',
        headers: {
            'X-RapidAPI-Key': '0a7f3e9406msh5385ead16268ba6p196e5ejsn196d4ea2ccb2',
            'X-RapidAPI-Host': 'twitter-api45.p.rapidapi.com'
        }
    },
    refreshInterval: 120000, // 2 minutes
    searchExamples: [
        { query: '#javascript', description: 'JavaScript hashtag tweets' },
        { query: '#AI', description: 'AI related tweets' },
        { query: '#webdev', description: 'Web development tweets' },
        { query: 'from:elonmusk', description: 'Tweets from Elon Musk' },
        { query: 'react OR vue', description: 'React or Vue mentions' },
        { query: '#OpenAI', description: 'OpenAI related tweets' }
    ]
};

// Application State
const state = {
    columns: new Map(),
    requestsUsed: 0,
    theme: 'light',
    refreshIntervals: new Map()
};

// API Service
const api = {
    async searchTweets(query, count = 20, isSilent = false) {
        const url = new URL(CONFIG.api.baseUrl + CONFIG.api.endpoint);
        url.searchParams.append('query', query);
        url.searchParams.append('count', count.toString());

        try {
            if (!isSilent) {
                console.log(`Fetching tweets for query: "${query}"`);
            }
            
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: CONFIG.api.headers
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            state.requestsUsed++;
            this.updateRateLimit();
            
            if (!isSilent) {
                console.log('API Response:', data);
            }
            
            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    },

    updateRateLimit() {
        const usageElement = document.getElementById('apiUsage');
        if (usageElement) {
            usageElement.textContent = `${state.requestsUsed}/1000`;
        }
    }
};

// Tweet Column Class
class TweetColumn {
    constructor(id, type, config) {
        this.id = id;
        this.type = type;
        this.config = config;
        this.tweets = [];
        this.isLoading = false;
        this.hasError = false;
        this.newTweetsCount = 0;
        this.element = null;
        this.lastUpdate = null;
    }

    async loadTweets(isSilent = false) {
        if (!isSilent) {
            this.isLoading = true;
            this.updateUI();
        }
        
        this.hasError = false;

        try {
            const data = await api.searchTweets(this.config.query, 20, isSilent);
            
            // Handle different possible response structures
            let tweets = [];
            if (data.timeline) {
                tweets = data.timeline;
            } else if (data.statuses) {
                tweets = data.statuses;
            } else if (data.data) {
                tweets = data.data;
            } else if (Array.isArray(data)) {
                tweets = data;
            } else {
                console.warn('Unexpected API response structure:', data);
                tweets = [];
            }

            const newTweets = this.processTweets(tweets);
            
            if (isSilent) {
                this.updateTweetsSilently(newTweets);
            } else {
                this.tweets = newTweets;
            }
            
        } catch (error) {
            console.error(`Error loading tweets for column ${this.id}:`, error);
            this.hasError = true;
            this.errorMessage = error.message;
        } finally {
            if (!isSilent) {
                this.isLoading = false;
            }
            this.lastUpdate = new Date();
            this.updateUI();
        }
    }

    processTweets(tweetData) {
        if (!Array.isArray(tweetData)) {
            console.warn('Tweet data is not an array:', tweetData);
            return [];
        }

        return tweetData.map(tweet => {
            // Handle different possible data structures
            const tweetText = tweet.text || tweet.full_text || tweet.tweet || 'No content available';
            
            // Extract user information
            const user = tweet.user || tweet.author || {};
            const userName = user.name || user.display_name || 'Unknown User';
            const userScreenName = user.screen_name || user.username || tweet.username || 'unknown';
            const userAvatar = user.profile_image_url_https || user.profile_image_url || user.avatar || null;
            
            // Extract timestamp
            const createdAt = tweet.created_at || tweet.date || tweet.timestamp || new Date().toISOString();
            
            // Extract engagement metrics
            const likes = parseInt(tweet.favorite_count || tweet.favorites || tweet.likes || 0);
            const retweets = parseInt(tweet.retweet_count || tweet.retweets || 0);
            const replies = parseInt(tweet.reply_count || tweet.replies || 0);
            
            // Extract media
            const media = [];
            if (tweet.entities && tweet.entities.media) {
                media.push(...tweet.entities.media.map(m => ({
                    url: m.media_url_https || m.media_url,
                    type: m.type
                })));
            }
            if (tweet.media && Array.isArray(tweet.media)) {
                media.push(...tweet.media.map(m => ({
                    url: m.media_url_https || m.url,
                    type: m.type
                })));
            }

            return {
                id: tweet.id_str || tweet.id || tweet.tweetID || `tweet_${Math.random().toString(36).substr(2, 9)}`,
                text: tweetText,
                user: {
                    name: userName,
                    username: userScreenName,
                    avatar: userAvatar
                },
                timestamp: this.formatTimestamp(createdAt),
                engagement: {
                    likes: likes,
                    retweets: retweets,
                    replies: replies
                },
                media: media,
                created_at: createdAt,
                isNew: false
            };
        }).filter(tweet => tweet.text !== 'No content available' || tweet.user.name !== 'Unknown User');
    }

    updateTweetsSilently(newTweets) {
        if (newTweets.length === 0) return;
        
        const existingIds = new Set(this.tweets.map(t => t.id));
        const genuinelyNew = newTweets.filter(t => !existingIds.has(t.id));
        
        if (genuinelyNew.length > 0) {
            genuinelyNew.forEach(tweet => tweet.isNew = true);
            this.newTweetsCount += genuinelyNew.length;
            this.tweets = [...genuinelyNew, ...this.tweets].slice(0, 50);
            this.showNewTweetsBanner();
        }
    }

    showNewTweetsBanner() {
        if (this.element) {
            const banner = this.element.querySelector('.new-tweets-banner');
            const bannerText = this.element.querySelector('.banner-text');
            
            if (banner && bannerText) {
                bannerText.textContent = `${this.newTweetsCount} new tweet${this.newTweetsCount > 1 ? 's' : ''}`;
                banner.classList.add('visible');
            }
        }
    }

    loadNewTweets() {
        if (this.newTweetsCount > 0) {
            this.newTweetsCount = 0;
            const banner = this.element.querySelector('.new-tweets-banner');
            if (banner) {
                banner.classList.remove('visible');
            }
            
            // Mark all tweets as not new and scroll to top
            this.tweets.forEach(tweet => tweet.isNew = false);
            this.updateUI();
            
            const content = this.element.querySelector('.column-content');
            if (content) {
                content.scrollTop = 0;
            }
        }
    }

    formatTimestamp(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 1) return 'now';
            if (diffMins < 60) return `${diffMins}m`;
            if (diffHours < 24) return `${diffHours}h`;
            if (diffDays < 7) return `${diffDays}d`;
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch (error) {
            return 'unknown';
        }
    }

    updateUI() {
        if (!this.element) return;

        const content = this.element.querySelector('.column-content');

        if (this.isLoading) {
            content.innerHTML = `
                <div class="column-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    Loading tweets...
                </div>
            `;
            return;
        }

        if (this.hasError) {
            content.innerHTML = `
                <div class="column-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h4>Error Loading Tweets</h4>
                    <p>${this.errorMessage || 'Failed to load tweets. Please try again.'}</p>
                    <button class="btn btn--primary btn--sm retry-btn" onclick="retryColumn('${this.id}')">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>
            `;
            return;
        }

        if (this.tweets.length === 0) {
            content.innerHTML = `
                <div class="column-error">
                    <i class="fas fa-search"></i>
                    <h4>No Tweets Found</h4>
                    <p>No tweets found for "${this.config.query}"</p>
                    <button class="btn btn--primary btn--sm retry-btn" onclick="retryColumn('${this.id}')">
                        <i class="fas fa-redo"></i> Try Again
                    </button>
                </div>
            `;
            return;
        }

        const tweetsHtml = this.tweets.map(tweet => this.renderTweet(tweet)).join('');
        content.innerHTML = tweetsHtml;
    }

    renderTweet(tweet) {
        const avatarContent = tweet.user.avatar 
            ? `<img src="${tweet.user.avatar}" alt="${tweet.user.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div style="display:none; width:100%; height:100%; background: var(--color-primary); color: var(--color-btn-primary-text); align-items:center; justify-content:center; font-weight:bold;">${tweet.user.name.charAt(0).toUpperCase()}</div>`
            : `<div style="width:100%; height:100%; background: var(--color-primary); color: var(--color-btn-primary-text); display:flex; align-items:center; justify-content:center; font-weight:bold;">${tweet.user.name.charAt(0).toUpperCase()}</div>`;

        const mediaHtml = tweet.media && tweet.media.length > 0 
            ? `<div class="tweet-media">
                ${tweet.media.map(m => 
                    m.type === 'photo' || !m.type
                        ? `<img src="${m.url}" alt="Tweet media" loading="lazy" onerror="this.parentElement.style.display='none';">` 
                        : ''
                ).join('')}
               </div>`
            : '';

        return `
            <div class="tweet-card ${tweet.isNew ? 'new' : ''}" data-tweet-id="${tweet.id}">
                <div class="tweet-header">
                    <div class="tweet-avatar">
                        ${avatarContent}
                    </div>
                    <div class="tweet-user-info">
                        <div class="tweet-name">${this.escapeHtml(tweet.user.name)}</div>
                        <div class="tweet-username">@${this.escapeHtml(tweet.user.username)}</div>
                        <div class="tweet-timestamp">${tweet.timestamp}</div>
                    </div>
                </div>
                <div class="tweet-content">${this.formatTweetText(tweet.text)}</div>
                ${mediaHtml}
                <div class="tweet-engagement">
                    <div class="engagement-item">
                        <i class="far fa-comment"></i>
                        <span>${this.formatNumber(tweet.engagement.replies)}</span>
                    </div>
                    <div class="engagement-item">
                        <i class="fas fa-retweet"></i>
                        <span>${this.formatNumber(tweet.engagement.retweets)}</span>
                    </div>
                    <div class="engagement-item">
                        <i class="far fa-heart"></i>
                        <span>${this.formatNumber(tweet.engagement.likes)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    formatTweetText(text) {
        // Basic formatting for hashtags, mentions, and URLs
        return this.escapeHtml(text)
            .replace(/#(\w+)/g, '<span style="color: var(--color-primary);">#$1</span>')
            .replace(/@(\w+)/g, '<span style="color: var(--color-primary);">@$1</span>');
    }

    formatNumber(num) {
        if (num < 1000) return num.toString();
        if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
        return (num / 1000000).toFixed(1) + 'M';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    createElement() {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'tweet-column';
        columnDiv.dataset.columnId = this.id;

        const title = this.config.query;
        const icon = 'fas fa-search';

        columnDiv.innerHTML = `
            <div class="column-header">
                <div class="column-title">
                    <i class="${icon}"></i>
                    <span>${this.escapeHtml(title)}</span>
                </div>
                <div class="column-actions">
                    <button title="Refresh" onclick="refreshColumn('${this.id}')">
                        <i class="fas fa-redo"></i>
                    </button>
                    <button title="Remove" onclick="removeColumn('${this.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="new-tweets-banner" onclick="loadNewTweets('${this.id}')">
                <span class="banner-text"></span> - Click to view
            </div>
            <div class="column-content"></div>
        `;

        this.element = columnDiv;
        return columnDiv;
    }

    startAutoRefresh() {
        if (state.refreshIntervals.has(this.id)) {
            clearInterval(state.refreshIntervals.get(this.id));
        }

        const interval = setInterval(() => {
            this.loadTweets(true); // Silent refresh
        }, CONFIG.refreshInterval);
        
        state.refreshIntervals.set(this.id, interval);
        console.log(`Started auto-refresh for column ${this.id} every ${CONFIG.refreshInterval/1000} seconds`);
    }

    stopAutoRefresh() {
        if (state.refreshIntervals.has(this.id)) {
            clearInterval(state.refreshIntervals.get(this.id));
            state.refreshIntervals.delete(this.id);
            console.log(`Stopped auto-refresh for column ${this.id}`);
        }
    }
}

// Column Manager
const columnManager = {
    container: null,
    emptyState: null,

    init() {
        this.container = document.getElementById('columnsContainer');
        this.emptyState = document.getElementById('emptyState');
    },

    addColumn(type, config) {
        const id = 'col_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const column = new TweetColumn(id, type, config);
        
        state.columns.set(id, column);
        
        const columnElement = column.createElement();
        this.container.appendChild(columnElement);
        
        this.updateEmptyState();
        
        // Load initial data and start auto-refresh
        column.loadTweets(false);
        column.startAutoRefresh();
        
        return column;
    },

    removeColumn(id) {
        const column = state.columns.get(id);
        if (column) {
            column.stopAutoRefresh();
            if (column.element) {
                column.element.remove();
            }
            state.columns.delete(id);
            this.updateEmptyState();
        }
    },

    refreshColumn(id) {
        const column = state.columns.get(id);
        if (column) {
            column.loadTweets(false);
        }
    },

    updateEmptyState() {
        if (state.columns.size === 0) {
            this.emptyState.style.display = 'flex';
        } else {
            this.emptyState.style.display = 'none';
        }
    }
};

// Global functions for onclick handlers
function removeColumn(id) { 
    columnManager.removeColumn(id); 
}

function refreshColumn(id) { 
    columnManager.refreshColumn(id); 
}

function retryColumn(id) { 
    columnManager.refreshColumn(id); 
}

function loadNewTweets(id) { 
    const column = state.columns.get(id);
    if (column) column.loadNewTweets();
}

// UI Functions
function showLoading(text = 'Loading...') {
    const loadingText = document.getElementById('loadingText');
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingText) loadingText.textContent = text;
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function showAddColumnModal() {
    console.log('showAddColumnModal called');
    const modal = document.getElementById('addColumnModal');
    console.log('Modal element:', modal);
    
    if (modal) {
        modal.classList.remove('hidden');
        console.log('Modal classes after removing hidden:', modal.classList.toString());
        
        const searchQuery = document.getElementById('searchQuery');
        if (searchQuery) {
            setTimeout(() => searchQuery.focus(), 100);
        }
    } else {
        console.error('Modal element not found!');
    }
}

function hideAddColumnModal() {
    console.log('hideAddColumnModal called');
    const modal = document.getElementById('addColumnModal');
    if (modal) {
        modal.classList.add('hidden');
        console.log('Modal hidden');
    }
    resetAddColumnForm();
}

function resetAddColumnForm() {
    const searchQuery = document.getElementById('searchQuery');
    if (searchQuery) searchQuery.value = '';
}

function confirmAddColumn() {
    console.log('confirmAddColumn called');
    const searchQuery = document.getElementById('searchQuery');
    
    if (!searchQuery) {
        console.error('Search query element not found');
        return;
    }
    
    const query = searchQuery.value.trim();
    console.log('Query entered:', query);
    
    if (!query) {
        alert('Please enter a search query');
        return;
    }
    
    const config = {
        query: query
    };
    
    console.log('Adding column with config:', config);
    columnManager.addColumn('search', config);
    hideAddColumnModal();
}

function toggleTheme() {
    const body = document.body;
    const themeButton = document.getElementById('themeToggle');
    
    if (state.theme === 'light') {
        body.dataset.colorScheme = 'dark';
        if (themeButton) themeButton.innerHTML = '<i class="fas fa-sun"></i>';
        state.theme = 'dark';
    } else {
        body.dataset.colorScheme = 'light';
        if (themeButton) themeButton.innerHTML = '<i class="fas fa-moon"></i>';
        state.theme = 'light';
    }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing TweetDeck Clone with real Twitter API...');
    
    // Initialize column manager
    columnManager.init();
    
    // Initialize search examples
    const container = document.getElementById('searchExamples');
    if (container) {
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('example-tag')) {
                const searchQuery = document.getElementById('searchQuery');
                if (searchQuery) {
                    searchQuery.value = e.target.dataset.query;
                }
            }
        });
    }
    
    // Event handlers for header
    const addColumnBtn = document.getElementById('addColumnBtn');
    const firstColumnBtn = document.getElementById('firstColumnBtn');
    const themeBtn = document.getElementById('themeToggle');
    
    if (addColumnBtn) {
        console.log('Adding event listener to addColumnBtn');
        addColumnBtn.addEventListener('click', function(e) {
            console.log('Add column button clicked');
            e.preventDefault();
            e.stopPropagation();
            showAddColumnModal();
        });
    } else {
        console.error('addColumnBtn not found');
    }
    
    if (firstColumnBtn) {
        console.log('Adding event listener to firstColumnBtn');
        firstColumnBtn.addEventListener('click', function(e) {
            console.log('First column button clicked');
            e.preventDefault();
            e.stopPropagation();
            showAddColumnModal();
        });
    } else {
        console.error('firstColumnBtn not found');
    }
    
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    
    // Modal event handlers
    const addColumnOverlay = document.getElementById('addColumnOverlay');
    const closeAddColumn = document.getElementById('closeAddColumn');
    const cancelAddColumn = document.getElementById('cancelAddColumn');
    const confirmAddColumnBtn = document.getElementById('confirmAddColumn');
    
    if (addColumnOverlay) {
        addColumnOverlay.addEventListener('click', function(e) {
            console.log('Overlay clicked');
            hideAddColumnModal();
        });
    }
    
    if (closeAddColumn) {
        closeAddColumn.addEventListener('click', function(e) {
            console.log('Close button clicked');
            hideAddColumnModal();
        });
    }
    
    if (cancelAddColumn) {
        cancelAddColumn.addEventListener('click', function(e) {
            console.log('Cancel button clicked');
            hideAddColumnModal();
        });
    }
    
    if (confirmAddColumnBtn) {
        confirmAddColumnBtn.addEventListener('click', function(e) {
            console.log('Confirm button clicked');
            confirmAddColumn();
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    showAddColumnModal();
                    break;
                case 'r':
                    e.preventDefault();
                    state.columns.forEach(column => {
                        column.loadTweets(false);
                    });
                    break;
            }
        }
        
        if (e.key === 'Escape') {
            // Close any open modals
            document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                modal.classList.add('hidden');
            });
        }
    });
    
    // Update timestamps every minute
    setInterval(() => {
        state.columns.forEach(column => {
            if (column.tweets.length > 0) {
                column.tweets.forEach(tweet => {
                    if (tweet.created_at) {
                        tweet.timestamp = column.formatTimestamp(tweet.created_at);
                    }
                });
                
                // Only update UI if column is not loading
                if (!column.isLoading) {
                    const content = column.element?.querySelector('.column-content');
                    if (content) {
                        const timestamps = content.querySelectorAll('.tweet-timestamp');
                        timestamps.forEach((el, index) => {
                            if (column.tweets[index]) {
                                el.textContent = column.tweets[index].timestamp;
                            }
                        });
                    }
                }
            }
        });
    }, 60000);
    
    console.log('TweetDeck Clone initialized successfully');
    console.log('API Configuration:', {
        baseUrl: CONFIG.api.baseUrl,
        endpoint: CONFIG.api.endpoint,
        refreshInterval: `${CONFIG.refreshInterval / 1000} seconds`
    });
});

// Error handling
window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
});