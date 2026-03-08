(function () {
  // Central abstraction for rendering different content types in the members list area
  window.MembersContent = {
    contentType: null,
    currentUsername: null,
    currentChannel: null,
    searchQuery: null,
    _searchPending: null,

    render: function (options) {
      const container = document.getElementById('members-list');
      if (!container) return;

      const newType = options.type || 'members';
      const newUsername = options.username || null;
      const newChannel = options.channel || null;

      if (this.contentType === 'profile' && newType === 'profile' && this.currentUsername === newUsername) {
        return;
      }

      this.clearContainer(container);

      this.contentType = newType;
      this.currentUsername = newUsername;
      this.currentChannel = newChannel;

      switch (this.contentType) {
        case 'profile':
          this.renderProfile(container, options.username);
          break;
        case 'members':
          this.renderMembers(container, options);
          break;
        case 'search':
          this.renderSearch(container, options);
          break;
        case 'pinned':
          this.renderPinned(container, options);
          break;
        default:
          this.renderMembers(container, options);
      }

      if (window.lucide) window.lucide.createIcons({ root: container });
    },

    clearContainer: function (container) {
      container.innerHTML = '';
      container.style.display = '';
      const serverChannelHeader = document.getElementById('server-channel-header');
      if (serverChannelHeader && window.state?.serverUrl === 'dms.mistium.com') {
        serverChannelHeader.style.display = 'none';
      }
    },

    // Render function for profile card
    renderProfile: function (container, username) {
      const profileContainer = document.createElement('div');
      profileContainer.className = 'account-profile-content';
      container.appendChild(profileContainer);

      this._fetchAndRenderProfile(profileContainer, username);
    },

    _fetchAndRenderProfile: function (container, username) {
      const cachedProfile = window.accountCache?.[username];
      if (cachedProfile && Date.now() - cachedProfile._timestamp < 60000) {
        this._renderProfileData(container, cachedProfile);
        return;
      }

      container.innerHTML = `<div class="account-loading"><div class="account-loading-spinner"></div><div class="account-loading-text">Loading profile...</div></div>`;

      const self = this;
      fetch(`https://api.rotur.dev/profile?include_posts=0&name=${encodeURIComponent(username)}`)
        .then(response => {
          if (!response.ok) throw new Error('Profile not found');
          return response.json();
        })
        .then(data => {
          data._timestamp = Date.now();
          if (!window.accountCache) window.accountCache = {};
          window.accountCache[username] = data;
          self._renderProfileData(container, data);
        })
        .catch(error => {
          container.innerHTML = `
                        <div class="account-error">
                            <div style="font-size: 48px; margin-bottom: 16px;">😔</div>
                            <div>Could not load profile</div>
                            <div style="font-size: 12px; color: var(--text-dim); margin-top: 8px;">${error.message}</div>
                        </div>
                    `;
        });
    },

    _renderProfileData: function (container, data) {
      const joinedDate = new Date(data.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const bannerHtml = data.banner ? `<img src="${data.banner}" alt="Banner">` : '';
      const statusClass = this._getUserStatus(data.username);
      const isCurrentUser = window.state?.currentUser?.username === data.username;

      let userRoles = [];
      if (window.state?.serverUrl !== 'dms.mistium.com') {
        const serverUser = this._getUserByUsername(data.username, window.state?.serverUrl);
        if (serverUser?.roles?.length) userRoles = serverUser.roles;
      }

      container.innerHTML = `
                <div class="account-banner">${bannerHtml}</div>
                <div class="account-avatar-section">
                    <div class="account-avatar">
                        <img src="${data.pfp}" alt="${data.username}">
                        <div class="account-status-indicator ${statusClass}"></div>
                    </div>
                </div>
                </div>
                <div class="account-names-section">
                    <div class="account-username-text">${data.username}</div>
                    ${data.pronouns ? `<div class="account-global-name">${this._escapeHtml(data.pronouns)}</div>` : ''}
                </div>
                <div class="account-stats">
                    <div class="account-stat"><div class="account-stat-value">${data.followers || 0}</div><div class="account-stat-label">Followers</div></div>
                    <div class="account-stat"><div class="account-stat-value">${data.following || 0}</div><div class="account-stat-label">Following</div></div>
                    <div class="account-stat"><div class="account-stat-value">${data.currency ? data.currency.toLocaleString() : 0}</div><div class="account-stat-label">Credits</div></div>
                    <div class="account-stat"><div class="account-stat-value">${data.subscription || 'Free'}</div><div class="account-stat-label">Tier</div></div>
                </div>
                ${userRoles.length > 0 ? `
                <div class="account-section">
                    <div class="account-section-title">Roles</div>
                    <div class="account-roles">${userRoles.map(r => `<span class="account-role">${this._escapeHtml(r)}</span>`).join('')}</div>
                </div>` : ''}
                ${data.bio ? `
                <div class="account-section">
                    <div class="account-section-title">About Me</div>
                    <div class="account-bio">${this._escapeHtml(data.bio)}</div>
                </div>` : ''}
                <div class="account-section">
                    <div class="account-section-title">Member Since</div>
                    <div class="account-meta">
                        <div class="account-meta-item"><i data-lucide="calendar"></i><span>${joinedDate}</span></div>
                    </div>
                </div>
                ${isCurrentUser ? `
                <div class="account-section account-actions-section">
                    <button class="account-logout-button" onclick="window.logout()">
                        <i data-lucide="log-out"></i><span>Log Out</span>
                    </button>
                </div>` : ''}
            `;

      if (window.lucide) window.lucide.createIcons({ root: container });
    },

    // Render function for member list (existing functionality)
    renderMembers: function (container, options) {
      if (options && options.channel) {
        window.originalRenderMembers?.(options.channel);
      }
    },

    renderSearch: function (container, options) {
      const self = this;
      const channel = options.channel || window.state?.currentChannel;
      if (!channel) {
        container.innerHTML = `<div class="account-empty">Select a channel to search</div>`;
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'search-wrapper';
      wrapper.innerHTML = `
      <div class="search-header">
        <h3>Search Messages</h3>
        <span class="close-search" onclick="window.MembersContent._closeSearch()"><i data-lucide="x"></i></span>
      </div>
      <div class="search-input-wrapper">
        <input type="text" class="search-input" id="message-search-input" placeholder="Search in #${channel.name}..." autocomplete="off">
        <button class="search-submit-btn" id="search-submit-btn"><i data-lucide="search"></i></button>
      </div>
      <div class="search-results" id="search-results"></div>
    `;
      container.appendChild(wrapper);

      const input = wrapper.querySelector('#message-search-input');
      const submitBtn = wrapper.querySelector('#search-submit-btn');
      const resultsContainer = wrapper.querySelector('#search-results');

      const performSearch = () => {
        const query = input.value.trim();
        if (!query) {
          resultsContainer.innerHTML = `<div class="account-empty">Enter a search term</div>`;
          return;
        }
        self._executeSearch(channel.name, query, resultsContainer);
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          performSearch();
        }
      });
      submitBtn.addEventListener('click', performSearch);

      setTimeout(() => input.focus(), 100);
    },

    _executeSearch: function (channelName, query, resultsContainer) {
      const self = this;
      resultsContainer.innerHTML = `<div class="account-loading"><div class="account-loading-spinner"></div><div class="account-loading-text">Searching...</div></div>`;

      const callbackId = 'search_' + Date.now();
      self._searchPending = callbackId;

      const serverUrl = window.state?.serverUrl;
      if (!serverUrl) {
        resultsContainer.innerHTML = `<div class="account-error">Not connected to server</div>`;
        return;
      }

      window.wsSend({ cmd: 'messages_search', channel: channelName, query: query }, serverUrl);

      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.cmd === 'messages_search' && data.channel === channelName && data.query === query) {
            window.wsConnections[serverUrl]?.socket?.removeEventListener('message', handler);
            if (self._searchPending === callbackId) {
              self._renderSearchResults(data.results || [], resultsContainer);
            }
          }
        } catch (e) { }
      };

      const conn = window.wsConnections[serverUrl];
      if (conn?.socket) {
        conn.socket.addEventListener('message', handler);
        setTimeout(() => {
          if (self._searchPending === callbackId) {
            conn.socket.removeEventListener('message', handler);
            if (resultsContainer.querySelector('.account-loading')) {
              resultsContainer.innerHTML = `<div class="account-error">Search timed out</div>`;
            }
          }
        }, 10000);
      }
    },

    _renderSearchResults: function (messages, container) {
      if (!messages || messages.length === 0) {
        container.innerHTML = `<div class="account-empty">No messages found</div>`;
        return;
      }

      container.innerHTML = '';
      messages.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
        <div class="search-result-header">
          <img src="https://avatars.rotur.dev/${msg.user}" class="search-result-avatar" alt="${msg.user}">
          <span class="search-result-username">${msg.user}</span>
          <span class="search-result-time">${this._formatTime(msg.timestamp)}</span>
        </div>
        <div class="search-result-content">${this._escapeHtml(msg.content)}</div>
      `;
        item.addEventListener('click', () => this._scrollToMessage(msg.id));
        container.appendChild(item);
      });
    },

    renderPinned: function (container, options) {
      const self = this;
      const channel = options.channel || window.state?.currentChannel;
      if (!channel) {
        container.innerHTML = `<div class="account-empty">Select a channel to view pinned messages</div>`;
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'pinned-wrapper';
      wrapper.innerHTML = `
      <div class="search-header">
        <h3>Pinned Messages</h3>
        <span class="close-search" onclick="window.MembersContent._closePinned()"><i data-lucide="x"></i></span>
      </div>
      <div class="pinned-results" id="pinned-results">
        <div class="account-loading"><div class="account-loading-spinner"></div><div class="account-loading-text">Loading...</div></div>
      </div>
    `;
      container.appendChild(wrapper);

      const resultsContainer = wrapper.querySelector('#pinned-results');
      self._fetchPinnedMessages(channel.name, resultsContainer);
    },

    _fetchPinnedMessages: function (channelName, resultsContainer) {
      const self = this;
      const serverUrl = window.state?.serverUrl;
      if (!serverUrl) {
        resultsContainer.innerHTML = `<div class="account-error">Not connected to server</div>`;
        return;
      }

      const callbackId = 'pinned_' + Date.now();
      self._pinnedPending = callbackId;

      window.wsSend({ cmd: 'messages_pinned', channel: channelName }, serverUrl);

      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.cmd === 'messages_pinned' && data.channel === channelName) {
            window.wsConnections[serverUrl]?.socket?.removeEventListener('message', handler);
            if (self._pinnedPending === callbackId) {
              self._renderPinnedMessages(data.messages || [], resultsContainer);
            }
          }
        } catch (e) { }
      };

      const conn = window.wsConnections[serverUrl];
      if (conn?.socket) {
        conn.socket.addEventListener('message', handler);
        setTimeout(() => {
          if (self._pinnedPending === callbackId) {
            conn.socket.removeEventListener('message', handler);
            if (resultsContainer.querySelector('.account-loading')) {
              resultsContainer.innerHTML = `<div class="account-error">Failed to load pinned messages</div>`;
            }
          }
        }, 10000);
      }
    },

    _renderPinnedMessages: function (messages, container) {
      if (!messages || messages.length === 0) {
        container.innerHTML = `<div class="account-empty">No pinned messages</div>`;
        return;
      }

      container.innerHTML = '';
      messages.forEach(msg => {
        const item = document.createElement('div');
        item.className = 'search-result-item pinned-item';
        item.innerHTML = `
        <div class="search-result-header">
          <img src="https://avatars.rotur.dev/${msg.user}" class="search-result-avatar" alt="${msg.user}">
          <span class="search-result-username">${msg.user}</span>
          <span class="search-result-time">${this._formatTime(msg.timestamp)}</span>
        </div>
        <div class="search-result-content">${this._escapeHtml(msg.content)}</div>
      `;
        item.addEventListener('click', () => this._scrollToMessage(msg.id));
        container.appendChild(item);
      });
    },

    _scrollToMessage: function (messageId) {
      const msgEl = document.querySelector(`[data-msg-id="${messageId}"]`);
      if (msgEl) {
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgEl.classList.add('highlight-message');
        setTimeout(() => msgEl.classList.remove('highlight-message'), 2000);
      }
    },

_closeSearch: function () {
  if (window.isMediumScreen && window.isMediumScreen() && window.closeMembersOverlay) {
    window.closeMembersOverlay();
  }
  window.MembersContent.render({ type: 'members', channel: window.state?.currentChannel });
},

_closePinned: function () {
  if (window.isMediumScreen && window.isMediumScreen() && window.closeMembersOverlay) {
    window.closeMembersOverlay();
  }
  window.MembersContent.render({ type: 'members', channel: window.state?.currentChannel });
},

    _formatTime: function (timestamp) {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    },

    // Helper functions
    _getUserStatus: function (username) {
      const user = this._getUserByUsername(username, window.state?.serverUrl);
      if (!user) return 'offline';
      return user.status === 'online' ? 'online' : user.status === 'idle' ? 'idle' : 'offline';
    },

    _getUserByUsername: function (username, serverUrl) {
      const targetUrl = serverUrl || window.state?.serverUrl;
      const users = window.state?.usersByServer?.[targetUrl] || {};
      const lower = username.toLowerCase();
      for (const [key, u] of Object.entries(users)) {
        if (key.toLowerCase() === lower) return u;
      }
      return null;
    },

    _escapeHtml: function (text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    // Reset state - call this when switching to a completely different channel/view
    reset: function () {
      this.contentType = null;
      this.currentUsername = null;
    }
  };
})();
