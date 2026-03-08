const wsConnections = {};
const wsStatus = {};
const serverValidatorKeys = {};
const authRetries = {};
const authRetryTimeouts = {};

let state = {
    token: null,
    serverUrl: 'dms.mistium.com',
    priorityServer: null,
    validatorsByServer: {},
    server: null,
    channelsByServer: {},
    currentChannel: null,
    messagesByServer: {},
    usersByServer: {},
    currentUserByServer: {},
    replyTo: null,
    servers: [],
    pingsByServer: {},
    serverPingsByServer: {},
    memberListDrawn: false,
    unreadPings: {},
    unreadReplies: {},
    unreadCountsByServer: {},
    unreadByChannel: {},
    readTimesByServer: {},
    _avatarCache: {},
    _avatarLoading: {},
    typingUsersByServer: {},
    typingTimeoutsByServer: {},
    _embedCache: {},
    lastChannelByServer: {},
    dmServers: [],
    loadingChannelsByServer: {},
    pendingChannelSelectsByServer: {},
    pendingMessageFetchesByChannel: {},
    switchingServer: false,
    renderInProgress: false,
    authenticatingByServer: {},
    pendingReplyFetches: {},
    friends: [],
    friendRequests: [],
    blockedUsers: [],
    scrollPositionsByChannel: {},
    autoScrollEnabled: true,
    _pendingChannelSwitch: null
};

const pendingReplyTimeouts = {};
let originFS = null;

// Store event listeners for cleanup
let eventListeners = {
    messageInput: null,
    input: null,
    inputKeyDown: null,
    messagesContainerTouchStart: null,
    messagesContainerTouchEnd: null,
    documentClick: null,
    documentKeyDown: null,
    imageUploadInput: null,
    channelForm: null
};

// ─── DRY HELPERS ────────────────────────────────────────────────────────────

/**
 * Safely close and clean up a WebSocket connection for the given URL.
 */
function closeWebSocket(url) {
    const conn = wsConnections[url];
    if (!conn) return;
    if (conn.socket && conn.closeHandler) {
        conn.socket.removeEventListener('close', conn.closeHandler);
    }
    if (conn.socket && conn.errorHandler) {
        conn.socket.removeEventListener('error', conn.errorHandler);
    }
    if (conn.socket && conn.socket.readyState !== WebSocket.CLOSED) {
        conn.socket.close();
    }
    delete wsConnections[url];
    delete wsStatus[url];
}

/**
* Create a guild warning icon element (error badge shown on server icons).
 */
function createGuildWarningIcon() {
    const warningIcon = document.createElement('div');
    warningIcon.className = 'guild-warning';
    warningIcon.innerHTML = '<i data-lucide="alert-circle"></i>';
    Object.assign(warningIcon.style, {
        position: 'absolute',
        top: '-2px',
        right: '-2px',
        background: '#ed4245',
        borderRadius: '50%',
        width: '16px',
        height: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '2'
    });
    return warningIcon;
}

/**
 * Attach a standard onerror fallback to an <img> that replaces it with a link.
 */
function attachImageErrorFallback(img, url) {
    img.onerror = () => {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = url;
        link.className = 'failed-image-link';
        const wrapper = img.closest('.chat-image-wrapper');
        if (wrapper) {
            wrapper.replaceWith(link);
        } else if (img.parentNode) {
            img.parentNode.replaceChild(link, img);
        }
    };
}

/**
 * Return the blocking action string for the current blocked-messages mode.
 * Replaces shouldHideBlockedMessage / shouldDimBlockedMessage / shouldCollapseBlockedMessage.
 * @returns {'hide'|'dim'|'collapse'}
 */
function getBlockedMessageAction(mode) {
    const validModes = ['hide', 'dim', 'collapse'];
    return validModes.includes(mode) ? mode : 'collapse';
}

// Keep the three original helpers as thin wrappers for full backward compatibility
function shouldHideBlockedMessage(mode) { return getBlockedMessageAction(mode) === 'hide'; }
function shouldDimBlockedMessage(mode) { return getBlockedMessageAction(mode) === 'dim'; }
function shouldCollapseBlockedMessage(mode) { return getBlockedMessageAction(mode) === 'collapse'; }

/**
 * Create a styled action button for the DM friend list.
 * @param {string} title  - Tooltip text
 * @param {string} icon   - Lucide icon name
 * @param {string} bgColor - CSS background value
 * @param {string} color  - CSS color value
 * @param {Function} onClick
 */
function createDMActionButton(title, icon, bgColor, color, onClick) {
    const btn = document.createElement('button');
    btn.className = 'dm-action-btn';
    btn.title = title;
    btn.style.cssText = `background: ${bgColor}; border: none; color: ${color}; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;`;
    btn.innerHTML = `<i data-lucide="${icon}" style="width: 18px; height: 18px;"></i>`;
    btn.onclick = (e) => { e.stopPropagation(); onClick(); };
    return btn;
}

/**
 * Create a DM friend-list row element.
 * @param {string} username
 * @param {HTMLElement[]} actionElements - Action buttons to append
 * @param {Function} [onRowClick]
 */
function createUserListItem(username, actionElements, onRowClick) {
    const item = document.createElement('div');
    item.className = 'dm-friend-item';
    item.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 10px 20px; cursor: pointer; transition: background 0.2s ease;';

    const avatar = document.createElement('img');
    avatar.src = `https://avatars.rotur.dev/${username}`;
    avatar.alt = username;
    avatar.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';

    const usernameSpan = document.createElement('span');
    usernameSpan.textContent = username;
    usernameSpan.style.cssText = 'flex: 1; color: var(--text); font-size: 15px; font-weight: 500;';

    item.appendChild(avatar);
    item.appendChild(usernameSpan);
    actionElements.forEach(el => item.appendChild(el));

    item.addEventListener('mouseenter', () => { item.style.background = 'var(--surface-hover)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    if (onRowClick) item.addEventListener('click', onRowClick);

    return item;
}

// ─── END DRY HELPERS ─────────────────────────────────────────────────────────

// Function to clean up event listeners and prevent memory leaks
function cleanupEventListeners() {
    const input = document.getElementById('message-input');
    const messagesContainer = document.querySelector('.messages-container');
    const channelForm = document.getElementById('channel-form');

    if (eventListeners.input) {
        if (input) input.removeEventListener('input', eventListeners.input);
        eventListeners.input = null;
    }
    if (eventListeners.inputKeyDown) {
        if (input) input.removeEventListener('keydown', eventListeners.inputKeyDown);
        eventListeners.inputKeyDown = null;
    }
    if (eventListeners.messagesContainerTouchStart) {
        if (messagesContainer) messagesContainer.removeEventListener('touchstart', eventListeners.messagesContainerTouchStart);
        eventListeners.messagesContainerTouchStart = null;
    }
    if (eventListeners.messagesContainerTouchEnd) {
        if (messagesContainer) messagesContainer.removeEventListener('touchend', eventListeners.messagesContainerTouchEnd);
        eventListeners.messagesContainerTouchEnd = null;
    }
    if (eventListeners.documentClick) {
        document.removeEventListener('click', eventListeners.documentClick);
        eventListeners.documentClick = null;
    }
    if (eventListeners.documentKeyDown) {
        document.removeEventListener('keydown', eventListeners.documentKeyDown);
        eventListeners.documentKeyDown = null;
    }
    if (eventListeners.imageUploadInput) {
        const imageUploadInput = document.getElementById('image-upload-input');
        if (imageUploadInput) imageUploadInput.removeEventListener('change', eventListeners.imageUploadInput);
        eventListeners.imageUploadInput = null;
    }
    if (eventListeners.channelForm) {
        if (channelForm) channelForm.removeEventListener('submit', eventListeners.channelForm);
        eventListeners.channelForm = null;
    }
    if (timestampInterval) {
        clearInterval(timestampInterval);
        timestampInterval = null;
    }
    if (rateLimitTimer) {
        clearInterval(rateLimitTimer);
        rateLimitTimer = null;
    }
}

window.addEventListener('beforeunload', cleanupEventListeners);

Object.defineProperty(state, 'channels', {
    get() { return state.channelsByServer[state.serverUrl] || []; },
    set(value) { state.channelsByServer[state.serverUrl] = value; }
});
Object.defineProperty(state, 'messages', {
    get() { return state.messagesByServer[state.serverUrl] || {}; },
    set(value) { state.messagesByServer[state.serverUrl] = value; }
});
Object.defineProperty(state, 'pings', {
    get() {
        if (!state.pingsByServer[state.serverUrl]) state.pingsByServer[state.serverUrl] = {};
        return state.pingsByServer[state.serverUrl];
    },
    set(value) { state.pingsByServer[state.serverUrl] = value; }
});
Object.defineProperty(state, 'users', {
    get() { return state.usersByServer[state.serverUrl] || {}; },
    set(value) { state.usersByServer[state.serverUrl] = value; }
});
Object.defineProperty(state, 'currentUser', {
    get() { return state.currentUserByServer[state.serverUrl]; },
    set(value) { state.currentUserByServer[state.serverUrl] = value; }
});
Object.defineProperty(state, 'typingUsers', {
    get() {
        if (!state.typingUsersByServer[state.serverUrl]) state.typingUsersByServer[state.serverUrl] = {};
        return state.typingUsersByServer[state.serverUrl];
    },
    set(value) { state.typingUsersByServer[state.serverUrl] = value; }
});
Object.defineProperty(state, 'typingTimeouts', {
    get() {
        if (!state.typingTimeoutsByServer[state.serverUrl]) state.typingTimeoutsByServer[state.serverUrl] = {};
        return state.typingTimeoutsByServer[state.serverUrl];
    },
    set(value) { state.typingTimeoutsByServer[state.serverUrl] = value; }
});

const DEFAULT_SERVERS = [
    { name: 'OriginChats', url: 'chats.mistium.com', icon: null }
];

async function loadServers() {
    const path = '/application data/chats@mistium/servers.json';
    try {
        await originFS.createFolders('/application data/chats@mistium');
        const content = await originFS.readFileContent(path);
        return JSON.parse(content);
    } catch (error) {
        return [...DEFAULT_SERVERS];
    }
}

async function saveServers() {
    const path = '/application data/chats@mistium/servers.json';
    const content = JSON.stringify(state.servers);
    try {
        await originFS.createFolders('/application data/chats@mistium');
        if (await originFS.exists(path)) {
            await originFS.writeFile(path, content);
        } else {
            await originFS.createFile(path, content);
        }
        await originFS.commit();
    } catch (error) {
        console.error('Failed to save servers:', error);
    }
}

async function loadReadTimes() {
    const path = '/application data/chats@mistium/read_times.json';
    try {
        await originFS.createFolders('/application data/chats@mistium');
        const content = await originFS.readFileContent(path);
        return JSON.parse(content);
    } catch (error) {
        return {};
    }
}

async function saveReadTimes() {
    const path = '/application data/chats@mistium/read_times.json';
    const content = JSON.stringify(state.readTimesByServer);
    try {
        await originFS.createFolders('/application data/chats@mistium');
        if (await originFS.exists(path)) {
            await originFS.writeFile(path, content);
        } else {
            await originFS.createFile(path, content);
        }
        await originFS.commit();
    } catch (error) {
        console.error('Failed to save read times:', error);
    }
}

function updateCurrentChannelReadTime() {
    if (!state.serverUrl || !state.currentChannel) return;
    const ignoredChannels = ['home', 'relationships', 'notes', 'cmds', 'new_message'];
    if (ignoredChannels.includes(state.currentChannel.name)) return;

    if (!state.readTimesByServer[state.serverUrl]) {
        state.readTimesByServer[state.serverUrl] = {};
    }

    state.readTimesByServer[state.serverUrl][state.currentChannel.name] = Math.floor(Date.now() / 1000);
    saveReadTimes();
}

window.addEventListener('blur', updateCurrentChannelReadTime);
window.addEventListener('beforeunload', updateCurrentChannelReadTime);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') updateCurrentChannelReadTime();
});

function isChannelUnread(channel, serverUrl) {
    if (!channel.last_message) return false;
    const readTime = state.readTimesByServer[serverUrl]?.[channel.name];
    if (readTime === undefined) return true;
    return channel.last_message > readTime;
}

function hasServerUnread(serverUrl) {
    const channels = state.channelsByServer[serverUrl];
    if (!channels || channels.length === 0) return false;
    return channels.some(channel => {
        if (!checkPermission(channel.permissions?.view, state.currentUser?.roles)) return false;
        if (channel.type === 'separator' || channel.name === 'cmds') return false;
        return typeof isChannelUnread === 'function' && isChannelUnread(channel, serverUrl);
    });
}

function getChannelDisplayName(channel) {
    return channel.display_name || channel.name;
}

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
function playPingSound() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

function updateTitleWithPings() {
    const channelKey = `${state.serverUrl}:${state.currentChannel?.name}`;
    const pingCount = (state.unreadPings[channelKey] || 0) + (state.unreadReplies[channelKey] || 0);
    if (pingCount > 0) {
        document.title = `(${pingCount}) ${state.server}${state.currentChannel ? ' - ' + state.currentChannel.name : ''}`;
    } else {
        if (!state.server) {
            document.title = 'OriginChats';
            return;
        }
        document.title = `${state.server.name}${state.currentChannel ? ' - ' + state.currentChannel.name : ''}`;
    }
}

async function waitForDOMPurify(maxWait = 5000) {
    const startTime = Date.now();
    while (typeof DOMPurify === 'undefined' || !DOMPurify.sanitize) {
        if (Date.now() - startTime > maxWait) {
            console.error('DOMPurify failed to load within timeout period');
            return false;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return true;
}

window.onload = async function () {
    await waitForDOMPurify(5000);
    requestNotificationPermission();

    const savedToken = localStorage.getItem('originchats_token');
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token');

    if (token) {
        state.token = token;
        localStorage.setItem('originchats_token', token);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (savedToken) {
        state.token = savedToken;
    } else {
        window.location.href = `https://rotur.dev/auth?return_to=${encodeURIComponent(window.location.href)}`;
        return;
    }

    originFS = new window.originFSKit.OriginFSClient(state.token);
    state.servers = await loadServers();

    const serverParam = urlParams.get('server');
    if (serverParam && serverParam.trim()) {
        const serverUrl = serverParam.trim();
        if (!state.servers.some(s => s.url === serverUrl)) {
            state.servers.push({ url: serverUrl, name: serverUrl });
            await saveServers();
        }
        state.priorityServer = serverUrl;
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        state.priorityServer = 'dms.mistium.com';
    }

    const savedLastChannels = localStorage.getItem('originchats_last_channels');
    if (savedLastChannels) state.lastChannelByServer = JSON.parse(savedLastChannels);

    const savedDMServers = localStorage.getItem('originchats_dm_servers');
    if (savedDMServers) state.dmServers = JSON.parse(savedDMServers);

    state.readTimesByServer = await loadReadTimes();

    state.servers.forEach(server => {
        if (!state.unreadCountsByServer[server.url]) state.unreadCountsByServer[server.url] = 0;
    });
    if (!state.unreadCountsByServer['dms.mistium.com']) state.unreadCountsByServer['dms.mistium.com'] = 0;
    if (!state.serverPingsByServer['dms.mistium.com']) state.serverPingsByServer['dms.mistium.com'] = 0;

    const input = document.getElementById('message-input');
    const messagesContainer = document.querySelector('.messages-container');

    eventListeners.input = function (e) {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        handleMentionInput();
        handleChannelInput();
    };

    eventListeners.messagesContainerTouchStart = function (e) {
        touchStartX = e.changedTouches[0].screenX;
    };

    eventListeners.messagesContainerTouchEnd = function (e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    };

    function handleSwipe() {
        if (touchStartX > 50) return;
        if (touchEndX - touchStartX > 100) toggleMenu();
    }

    eventListeners.documentClick = function (e) {
        if (!e.target.closest('.server-info')) closeServerDropdown();
    };

    eventListeners.documentKeyDown = function (e) {
        if (e.key === 'Escape') {
            closeSettings();
            closeServerConfigModal();
            closeAccountModal();
            closeMenu();
            closeServerDropdown();
            if (window.editingMessage) {
                window.cancelEdit();
            } else if (state.replyTo) {
                cancelReply();
            }
        }
        if (window.canSendMessages) {
            const active = document.activeElement;
            const isInputFocused = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
            if (active !== input && !isInputFocused && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                input.focus();
                const startPos = input.selectionStart;
                const endPos = input.selectionEnd;
                const value = input.value;
                input.value = value.slice(0, startPos) + e.key + value.slice(endPos);
                input.selectionStart = input.selectionEnd = startPos + 1;
                input.dispatchEvent(new Event('input'));
            }
        }
    };

    eventListeners.inputKeyDown = function (e) {
        if (handleMentionNavigation(e) || handleChannelNavigation(e)) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
        if (e.key === 'ArrowUp' && !this.value.trim() && !window.editingMessage) {
            e.preventDefault();
            const channel = state.currentChannel?.name;
            if (!channel) return;
            const messages = state.messages[channel] || [];
            const myMessages = messages.filter(m => m.user === state.currentUser?.username);
            if (myMessages.length > 0 && window.startEditMessage) {
                window.startEditMessage(myMessages[myMessages.length - 1]);
            }
        }
    };

    if (input) {
        input.addEventListener('input', eventListeners.input);
        input.addEventListener('keydown', eventListeners.inputKeyDown);
    }
    if (messagesContainer) {
        messagesContainer.addEventListener('touchstart', eventListeners.messagesContainerTouchStart, { passive: true });
        messagesContainer.addEventListener('touchend', eventListeners.messagesContainerTouchEnd, { passive: true });
    }
    document.addEventListener('click', eventListeners.documentClick);
    document.addEventListener('keydown', eventListeners.documentKeyDown);

    if (window.lucide) window.lucide.createIcons();

    renderGuildSidebar();
    await connectToPriorityServer(state.priorityServer);
    switchServer(state.priorityServer);
    connectToOtherServers();
    setupTypingListener();
    setupInfiniteScroll();

    window.shortcodes = null;
    window.shortcodeMap = {};

    const loadShortcodes = () => {
        fetch("shortcodes.json")
            .then(response => response.json())
            .then(data => {
                window.shortcodes = data;
                for (const e of data) {
                    const code = e.label.toLowerCase().replace(/\s+/g, "_");
                    const emoji = e.emoji;

                    if (typeof emoji === 'string' && emoji.length <= 4 && !/[<>]/.test(emoji)) {
                        shortcodeMap[`:${code}:`] = emoji;
                        if (e.emoticon) {
                            if (Array.isArray(e.emoticon)) {
                                e.emoticon.forEach(x => shortcodeMap[x] = emoji);
                            } else {
                                shortcodeMap[e.emoticon] = emoji;
                            }
                        }
                    }
                }

                Object.defineProperty(window, 'shortcodeMap', {
                    writable: false,
                    configurable: false
                });

                const picker = document.querySelector('.reaction-picker');
                if (picker && picker.classList.contains('active') && window.renderEmojis) {
                    window.renderEmojis();
                }
            });
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(loadShortcodes);
    } else {
        setTimeout(loadShortcodes, 100);
    }
};

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showNotification(title, body, channel) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, { body, tag: channel });
        notification.onclick = function () { window.focus(); notification.close(); };
    }
}

function toggleMenu() {
    const channels = document.getElementById('channels');
    const guildSidebar = document.querySelector('.guild-sidebar');
    const overlay = document.querySelector('.overlay');
    const chatScreen = document.getElementById('chat-screen');
    channels.classList.toggle('open');
    guildSidebar.classList.toggle('open');
    overlay.classList.toggle('active');
    chatScreen.classList.toggle('overlay-active');
}

function isMediumScreen() {
  const width = window.innerWidth;
  return width >= 769 && width <= 1050;
}
window.isMediumScreen = isMediumScreen;

function toggleMembersList() {
  if (isMediumScreen()) {
    const membersList = document.getElementById('members-list');
    if (membersList.classList.contains('open')) {
      closeMembersOverlay();
      window.MembersContent?.render({ type: 'members', channel: window.state?.currentChannel });
    } else {
      openMembersOverlay();
    }
  } else {
    const membersList = document.getElementById('members-list');
    const overlay = document.querySelector('.overlay');
    const chatScreen = document.getElementById('chat-screen');
    membersList.classList.toggle('open');
    overlay.classList.toggle('active');
    chatScreen.classList.toggle('overlay-active');
  }
}

function openMembersOverlay() {
  const membersList = document.getElementById('members-list');
  const overlay = document.querySelector('.overlay');
  const chatScreen = document.getElementById('chat-screen');
  membersList.classList.add('open');
  overlay.classList.add('active');
  chatScreen.classList.add('overlay-active');
}

function closeMembersOverlay() {
  const membersList = document.getElementById('members-list');
  const overlay = document.querySelector('.overlay');
  const chatScreen = document.getElementById('chat-screen');
  membersList.classList.remove('open');
  overlay.classList.remove('active');
  chatScreen.classList.remove('overlay-active');
}
window.closeMembersOverlay = closeMembersOverlay;

function closeMenu() {
  document.querySelector('.channels').classList.remove('open');
  document.querySelector('.guild-sidebar').classList.remove('open');
  closeMembersOverlay();
}

let accountCache = {};

function closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    closeServerConfigModal();
}

function closeServerConfigModal() {
    const modal = document.getElementById('server-config-modal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
    editingServerId = null;
}

function openSettings() {
    closeMenu();
    closeAccountModal();
    const modal = document.getElementById('settings-modal');
    if (!modal) { console.error('Settings modal not found in DOM'); return; }
    modal.classList.add('active');
    modal.style.display = 'flex';
    renderMediaServersSettings();
    initVoiceSettings();
    initPrivacySettings();
    initChatSettings();
    initAppearanceSettings();
}

function openAccountModal(username) {
    const modal = document.getElementById('account-modal');
    const content = document.getElementById('account-content');
    modal.classList.add('active');
    content.innerHTML = `
        <div class="account-loading">
            <div class="account-loading-spinner"></div>
            <div class="account-loading-text">Loading profile...</div>
        </div>
    `;
    fetchAccountProfile(username);
    if (window.lucide) window.lucide.createIcons({ root: content });
}

function closeAccountModal() {
    document.getElementById('account-modal').classList.remove('active');
    closeServerConfigModal();
    closeSettings();
}

function openCurrentUserProfile() {
    if (state.currentUser && state.currentUser.username) openAccountModal(state.currentUser.username);
}

window.openCurrentUserProfile = openCurrentUserProfile;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.renderMediaServersSettings = renderMediaServersSettings;
window.toggleServerEnabled = toggleServerEnabled;
window.deleteServer = deleteServer;
window.openAddServerModal = openAddServerModal;
window.editServer = editServer;
window.closeServerConfigModal = closeServerConfigModal;
window.addHeaderRow = addHeaderRow;
window.addBodyParamRow = addBodyParamRow;
window.showError = showError;
window.hideErrorBanner = hideErrorBanner;

function updateGuildActiveState() {
    document.querySelectorAll('.guild-item').forEach(item => {
        item.classList.toggle('active', item.dataset.url === state.serverUrl);
    });
}

async function fetchAccountProfile(username) {
    if (accountCache[username] && Date.now() - accountCache[username]._timestamp < 60000) {
        renderAccountProfile(accountCache[username]);
        return;
    }
    try {
        const response = await fetch(`https://api.rotur.dev/profile?include_posts=0&name=${encodeURIComponent(username)}`);
        if (!response.ok) throw new Error('Profile not found');
        const data = await response.json();
        if (!data || typeof data !== 'object') throw new Error('Invalid profile data');
        data._timestamp = Date.now();
        accountCache[username] = data;
        renderAccountProfile(data);
    } catch (error) {
        const content = document.getElementById('account-content');
        if (!content) return;
        content.innerHTML = `
      <div class="account-error">
        <div style="font-size: 48px; margin-bottom: 16px;">😔</div>
        <div>Could not load profile</div>
        <div style="font-size: 12px; color: var(--text-dim); margin-top: 8px;">${escapeHtml(error.message)}</div>
      </div>
    `;
    }
}

async function fetchMyAccountData() {
    try {
        const response = await fetch(`https://api.rotur.dev/me?auth=${encodeURIComponent(state.token)}`);
        if (response.ok) {
            const data = await response.json();
            state.friends = data['sys.friends'] || [];
            state.friendRequests = data['sys.requests'] || [];
            state.blockedUsers = data['sys.blocked'] || [];
            renderDMTabContent(currentDMTab);
        }
    } catch (error) {
        console.error('Failed to fetch account data:', error);
    }
}

let currentDMTab = 'friends';

function switchDMTab(tab) {
    currentDMTab = tab;
    document.querySelectorAll('.dm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const dmFriendsContainer = document.getElementById('dm-friends-container');
    const messagesEl = document.getElementById('messages');
    if (dmFriendsContainer) dmFriendsContainer.style.display = 'block';
    if (messagesEl) messagesEl.style.display = 'none';
    renderDMTabContent(tab);
}

// ─── DM RELATIONSHIP TAB RENDERING ──────────────────────────────────────────
// Single source of truth for friends/requests/blocked list items

function _buildFriendsList(fragment) {
    if (state.friends.length === 0) return false;
    state.friends.forEach(username => {
        const dmBtn = createDMActionButton('Open DM', 'message-square', 'var(--surface-light)', 'var(--text-dim)', () => openDM(username));
        fragment.appendChild(createUserListItem(username, [dmBtn]));
    });
    return true;
}

function _buildRequestsList(fragment) {
    if (state.friendRequests.length === 0) return false;
    state.friendRequests.forEach(username => {
        const acceptBtn = createDMActionButton('Accept', 'check', 'var(--success)', 'white', () => acceptFriendRequest(username));
        const rejectBtn = createDMActionButton('Reject', 'x', 'var(--danger)', 'white', () => rejectFriendRequest(username));
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 8px;';
        actions.appendChild(acceptBtn);
        actions.appendChild(rejectBtn);
        fragment.appendChild(createUserListItem(username, [actions]));
    });
    return true;
}

function _buildBlockedList(fragment) {
    if (state.blockedUsers.length === 0) return false;
    state.blockedUsers.forEach(username => {
        const unblockBtn = createDMActionButton('Unblock', 'unlock', 'var(--surface-light)', 'var(--text-dim)', () => unblockUser(username));
        fragment.appendChild(createUserListItem(username, [unblockBtn]));
    });
    return true;
}

/**
 * Render the content of a DM tab (friends / requests / blocked / notes)
 * into any container element. The `legacyTitle` flag controls whether the
 * old uppercase section-title header is prepended (used by the old
 * `renderOldContainerContent` path).
 */
function _renderDMTabIntoContainer(container, tab, legacyTitle = false) {
    container.innerHTML = '';

    const emptyMessages = {
        friends: 'No friends yet',
        requests: 'No pending requests',
        blocked: 'No blocked users'
    };
    const titles = {
        friends: 'FRIENDS',
        requests: 'FRIEND REQUESTS',
        blocked: 'BLOCKED USERS'
    };
    const builders = {
        friends: _buildFriendsList,
        requests: _buildRequestsList,
        blocked: _buildBlockedList
    };

    if (legacyTitle && titles[tab]) {
        const tabTitle = document.createElement('div');
        tabTitle.className = 'dm-section-title';
        tabTitle.style.cssText = 'font-weight: 600; color: var(--text-dim); font-size: 12px; padding: 16px 20px 8px 20px; text-transform: uppercase; letter-spacing: 0.5px;';
        tabTitle.textContent = titles[tab];
        container.appendChild(tabTitle);
    }

    const fragment = document.createDocumentFragment();
    const hasItems = builders[tab] ? builders[tab](fragment) : false;

    if (!hasItems) {
        const emptyState = document.createElement('div');
        emptyState.style.cssText = legacyTitle
            ? 'padding: 16px 20px; color: var(--text-dim); font-size: 14px;'
            : 'padding: 20px; color: var(--text-dim); text-align: center;';
        emptyState.textContent = emptyMessages[tab] || 'Nothing here';
        container.appendChild(emptyState);
    } else {
        container.appendChild(fragment);
    }

    if (window.lucide) window.lucide.createIcons({ root: container });
}

// Public-facing renderDMTabContent used by switchDMTab and external callers
function renderDMTabContent(tab) {
    const contentDiv = document.querySelector('.dm-relationships-content');
    const oldContainer = document.getElementById('dm-friends-container');

    if (contentDiv) {
        _renderDMTabIntoContainer(contentDiv, tab, false);
    } else if (oldContainer) {
        _renderDMTabIntoContainer(oldContainer, tab, true);
    }
}

// ─── END DM RELATIONSHIP TAB RENDERING ───────────────────────────────────────

function openDM(username) {
    if (state.serverUrl !== 'dms.mistium.com') switchServer('dms.mistium.com');
    setTimeout(() => {
        const cmdsChannel = state.channels.find(c => c.name === 'cmds');
        if (cmdsChannel) wsSend({ cmd: 'message_new', content: `dm add ${username}`, channel: 'cmds' }, 'dms.mistium.com');
    }, 100);
}

async function acceptFriendRequest(username) {
    try {
        const response = await fetch(`https://api.rotur.dev/friends/accept/${encodeURIComponent(username)}?auth=${encodeURIComponent(state.token)}`, { method: 'POST' });
        if (response.ok) { await fetchMyAccountData(); renderDMTabContent('requests'); }
    } catch (error) { console.error('Failed to accept friend request:', error); }
}

async function rejectFriendRequest(username) {
    try {
        const response = await fetch(`https://api.rotur.dev/friends/reject/${encodeURIComponent(username)}?auth=${encodeURIComponent(state.token)}`, { method: 'POST' });
        if (response.ok) { await fetchMyAccountData(); renderDMTabContent('requests'); }
    } catch (error) { console.error('Failed to reject friend request:', error); }
}

async function unblockUser(username) {
    try {
        const response = await fetch(`https://api.rotur.dev/me/unblock/${encodeURIComponent(username)}?auth=${encodeURIComponent(state.token)}`);
        if (response.ok) { await fetchMyAccountData(); renderDMTabContent('blocked'); }
    } catch (error) { console.error('Failed to unblock user:', error); }
}

function renderAccountProfile(data) {
    const content = document.getElementById('account-content');
    const joinedDate = new Date(data.created).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const bannerHtml = data.banner ? `<img src="${proxyImageUrl(data.banner)}" alt="Banner">` : '';
    const statusFromClass = getUserStatusInServer(data.username);
    const isCurrentUser = state.currentUser && state.currentUser.username === data.username;
    const isDM = state.serverUrl === 'dms.mistium.com';

    let userRoles = [];
    if (!isDM) {
        const serverUser = getUserByUsernameCaseInsensitive(data.username, state.serverUrl);
        if (serverUser && serverUser.roles && serverUser.roles.length > 0) userRoles = serverUser.roles;
    }

    content.innerHTML = `
        <div class="account-banner">${bannerHtml}</div>
        <div class="account-avatar-section">
            <div class="account-avatar">
                <img src="${proxyImageUrl(data.pfp)}" alt="${data.username}">
                <div class="account-status-indicator ${statusFromClass}"></div>
            </div>
        </div>
        <div class="account-names-section">
            <div class="account-username-text">${data.username}</div>
            ${data.pronouns ? `<div class="account-global-name">${data.pronouns}</div>` : ''}
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
            <div class="account-roles">${userRoles.map(role => `<span class="account-role">${escapeHtml(role)}</span>`).join('')}</div>
        </div>` : ''}
        ${data.bio ? `
        <div class="account-section">
            <div class="account-section-title">About Me</div>
            <div class="account-bio">${escapeHtml(data.bio)}</div>
        </div>` : ''}
        <div class="account-section">
            <div class="account-section-title">Member Since</div>
            <div class="account-meta">
                <div class="account-meta-item"><i data-lucide="calendar"></i><span>${joinedDate}</span></div>
            </div>
        </div>
        ${isCurrentUser ? `
        <div class="account-section account-actions-section">
            <button class="account-logout-button" onclick="logout()">
                <i data-lucide="log-out"></i><span>Log Out</span>
            </button>
        </div>` : ''}
    `;
    if (window.lucide) window.lucide.createIcons({ root: content });
}

function getUserStatusInServer(username) {
    const user = getUserByUsernameCaseInsensitive(username, state.serverUrl);
    if (!user) return 'offline';
    return user.status === 'online' ? 'online' : user.status === 'idle' ? 'idle' : 'offline';
}

function updateAccountProfileStatusIndicator() {
    const indicator = document.querySelector('.account-status-indicator');
    if (!indicator) return;
    const username = document.querySelector('.account-username-text');
    if (!username) return;
    indicator.className = `account-status-indicator ${getUserStatusInServer(username.textContent)}`;
}

function getUserByUsernameCaseInsensitive(username, serverUrl) {
    const targetServerUrl = serverUrl || state.serverUrl;
    const users = state.usersByServer[targetServerUrl] || {};
    const lowerUsername = username.toLowerCase();
    for (const [key, user] of Object.entries(users)) {
        if (key.toLowerCase() === lowerUsername) return user;
    }
    return null;
}

function isEmojiOnly(str) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const parts = [...seg.segment(str.trim())];

    if (parts.length === 0) return false;

    return parts.every(({ segment }) =>
        /\p{Extended_Pictographic}/u.test(segment) || /^\s+$/.test(segment)
    );
}

window.openAccountModal = openAccountModal;
window.closeAccountModal = closeAccountModal;
window.updateAccountProfileStatusIndicator = updateAccountProfileStatusIndicator;
window.openDiscoveryModal = openDiscoveryModal;
window.closeDiscoveryModal = closeDiscoveryModal;
window.loadDiscoveryServers = loadDiscoveryServers;
window.switchDMTab = switchDMTab;
window.openDM = openDM;
window.acceptFriendRequest = acceptFriendRequest;
window.rejectFriendRequest = rejectFriendRequest;
window.unblockUser = unblockUser;

function toggleServerDropdown() {
    const dropdown = document.getElementById('server-dropdown');
    const arrow = document.getElementById('dropdown-arrow');
    dropdown.classList.toggle('active');
    arrow.classList.toggle('open');
    if (dropdown.classList.contains('active')) renderServerDropdown();
}

function closeServerDropdown() {
    const dropdown = document.getElementById('server-dropdown');
    const arrow = document.getElementById('dropdown-arrow');
    if (dropdown) dropdown.classList.remove('active');
    if (arrow) arrow.classList.remove('open');
}

function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window;
}

function markChannelAsRead(channel, serverUrl) {
    const targetUrl = serverUrl || state.serverUrl;

    if (!state.readTimesByServer[targetUrl]) {
        state.readTimesByServer[targetUrl] = {};
    }

    if (channel.last_message) {
        state.readTimesByServer[targetUrl][channel.name] = channel.last_message;
    }

    const channelKey = `${targetUrl}:${channel.name}`;
    if (state.unreadByChannel[channelKey]) {
        state.unreadCountsByServer[targetUrl] = Math.max(0, (state.unreadCountsByServer[targetUrl] || 0) - state.unreadByChannel[channelKey]);
        delete state.unreadByChannel[channelKey];
    }

    if (state.unreadPings[channel.name]) delete state.unreadPings[channel.name];
    if (state.unreadReplies[channel.name]) delete state.unreadReplies[channel.name];

    saveReadTimes();
    renderChannels();
}

function markDMAsRead(dmServer) {
    const serverUrl = 'dms.mistium.com';

    if (!state.readTimesByServer[serverUrl]) {
        state.readTimesByServer[serverUrl] = {};
    }

    if (dmServer.last_message) {
        state.readTimesByServer[serverUrl][dmServer.channel] = dmServer.last_message;
    }

    const channelKey = `${serverUrl}:${dmServer.channel}`;
    if (state.unreadByChannel[channelKey]) {
        state.unreadCountsByServer[serverUrl] = Math.max(0, (state.unreadCountsByServer[serverUrl] || 0) - state.unreadByChannel[channelKey]);
        delete state.unreadByChannel[channelKey];
    }

    if (state.unreadPings[dmServer.channel]) delete state.unreadPings[dmServer.channel];
    if (state.unreadReplies[dmServer.channel]) delete state.unreadReplies[dmServer.channel];

    saveReadTimes();
    renderGuildSidebar();
}

function showChannelContextMenu(event, channel) {
    const serverUrl = state.serverUrl;
    contextMenu(event)
        .item('Mark as Read', () => markChannelAsRead(channel, serverUrl), 'check-circle')
        .sep()
        .item('Copy Channel Name', () => navigator.clipboard.writeText(channel.name), 'copy')
        .show();
}

function renderServerDropdown() {
    renderGuildSidebar();
}

function addNewServer() {
    const url = prompt('Enter server URL (e.g., chats.mistium.com):');
    if (url && url.trim()) switchServer(url.trim());
}

function openDiscoveryModal() {
    document.getElementById('discovery-modal').classList.add('active');
    loadDiscoveryServers();
}

function closeDiscoveryModal() {
    document.getElementById('discovery-modal').classList.remove('active');
}

async function loadDiscoveryServers() {
    const loadingEl = document.getElementById('discovery-loading');
    const errorEl = document.getElementById('discovery-error');
    const listEl = document.getElementById('discovery-list');

    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';
    listEl.innerHTML = '';

    try {
        const response = await fetch('discovery.json');
        if (!response.ok) throw new Error('Failed to load discovery.json');
        const servers = await response.json();
        loadingEl.style.display = 'none';

        if (servers.length === 0) {
            listEl.innerHTML = '<p class="discovery-empty">No servers found</p>';
            return;
        }

        servers.forEach(server => {
            const isJoined = state.servers.some(s => s.url === server.url);
            const age = calculateServerAge(server.created_at);
            const card = document.createElement('div');
            card.className = 'discovery-card';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'discovery-icon';
            if (server.icon) {
                const img = document.createElement('img');
                img.src = server.icon;
                img.alt = server.name;
                iconDiv.appendChild(img);
            } else {
                const initials = document.createElement('span');
                initials.textContent = server.name.substring(0, 2).toUpperCase();
                iconDiv.appendChild(initials);
            }

            const infoDiv = document.createElement('div');
            infoDiv.className = 'discovery-info';
            infoDiv.innerHTML = `
                <h3>${escapeHtml(server.name)}</h3>
                <div class="discovery-meta">
                    <span><i data-lucide="user"></i> ${escapeHtml(server.owner)}</span>
                    <span><i data-lucide="clock"></i> ${age}</span>
                </div>
            `;

            const actionDiv = document.createElement('div');
            actionDiv.className = 'discovery-actions';
            const joinBtn = document.createElement('button');
            joinBtn.className = isJoined ? 'btn btn-secondary' : 'btn btn-primary';
            joinBtn.disabled = isJoined;
            joinBtn.innerHTML = isJoined ? '<i data-lucide="check"></i> Joined' : '<i data-lucide="plus"></i> Join';
            if (!isJoined) joinBtn.onclick = () => joinDiscoveryServer(server);
            actionDiv.appendChild(joinBtn);

            card.appendChild(iconDiv);
            card.appendChild(infoDiv);
            card.appendChild(actionDiv);
            listEl.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons({ root: listEl });
    } catch (error) {
        console.error('Failed to load discovery servers:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'flex';
    }
}

function calculateServerAge(createdTimestamp) {
    if (!createdTimestamp) return 'Unknown';
    const diffMs = Date.now() - createdTimestamp;
    const diffDays = Math.floor(diffMs / 86400000);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    if (diffYears > 0) return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
    if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return 'Today';
}

async function joinDiscoveryServer(server) {
    try {
        state.servers.push({ name: server.name, url: server.url, icon: server.icon || null });
        state.unreadCountsByServer[server.url] = 0;
        await saveServers();
        if (!wsConnections[server.url]) connectToServer(server.url);
        renderGuildSidebar();
        switchServer(server.url);
        closeDiscoveryModal();
    } catch (error) {
        console.error('Failed to join server:', error);
        showError('Failed to join server. Please try again.');
    }
}

function switchServer(url) {
    updateCurrentChannelReadTime();
    console.log('[DEBUG] switchServer called with url:', url, 'current state.switchingServer:', state.switchingServer);
    if (state.switchingServer) { console.log('[DEBUG] switchServer blocked - already switching'); return; }
    state.switchingServer = true;
    const originalUrl = state.serverUrl;

    if (state.currentChannel) {
        state.lastChannelByServer[originalUrl] = state.currentChannel.name;
        localStorage.setItem('originchats_last_channels', JSON.stringify(state.lastChannelByServer));
    }

    Object.keys(state.pendingMessageFetchesByChannel).forEach(key => {
        if (key.startsWith(`${originalUrl}:`)) delete state.pendingMessageFetchesByChannel[key];
    });

    document.getElementById('messages').innerHTML = '<div class="loading-throbber"></div>';
    clearRateLimit();
    state.serverUrl = url;
    localStorage.setItem('serverUrl', url);
    state.unreadCountsByServer[url] = 0;
    if (state.serverPingsByServer[url]) state.serverPingsByServer[url] = 0;
    Object.keys(state.unreadReplies).forEach(key => {
        if (key.startsWith(`${url}:`)) delete state.unreadReplies[key];
    });
    Object.keys(state.unreadPings).forEach(key => {
        if (key.startsWith(`${url}:`)) delete state.unreadPings[key];
    });
    renderGuildSidebar();
    state.currentChannel = null;

    if (!wsConnections[url] || wsConnections[url].status !== 'connected') connectToServer(url);

    const server = state.servers.find(s => s.url === url);
    state.server = server;
    const serverName = server ? server.name : (url === 'dms.mistium.com' ? 'Direct Messages' : url);
    document.getElementById('server-name').innerHTML = `<span>${serverName}</span>`;

    document.querySelectorAll('.server-settings-btn').forEach(btn => {
        btn.style.display = url === 'dms.mistium.com' ? 'none' : 'flex';
    });

    const channelHeaderName = document.getElementById('channel-header-name');
    const serverChannelHeader = document.getElementById('server-channel-header');

    if (url === 'dms.mistium.com') {
        if (serverChannelHeader) serverChannelHeader.style.display = 'none';
        fetchMyAccountData();
        selectHomeChannel();
        const dmFriendsContainer = document.getElementById('dm-friends-container');
        if (dmFriendsContainer) dmFriendsContainer.style.display = 'none';
    } else {
        if (serverChannelHeader) serverChannelHeader.style.display = 'flex';
        if (channelHeaderName) channelHeaderName.parentElement.style.display = 'flex';
        const addBtn = document.getElementById('channel-add-btn');
        if (addBtn) addBtn.style.display = 'none';
        const dmFriendsContainer = document.getElementById('dm-friends-container');
        const messagesEl = document.getElementById('messages');
        if (dmFriendsContainer) dmFriendsContainer.style.display = 'none';
        if (messagesEl) messagesEl.style.display = 'flex';
        if (channelHeaderName) channelHeaderName.textContent = serverName;
    }

    renderChannels();

    const channels = state.channels;
    if (channels.length > 0 && url !== 'dms.mistium.com') {
        if (state.loadingChannelsByServer[url]) {
            delete state.pendingChannelSelectsByServer[url];
        } else {
            const lastChannelName = state.lastChannelByServer[url];
            const lastChannel = lastChannelName ? channels.find(c => c.name === lastChannelName) : null;
            if (lastChannel || channels[0]) selectChannel(lastChannel || channels[0]);
        }
    } else if (url !== 'dms.mistium.com') {
        document.getElementById('channel-name').textContent = '';
        document.getElementById('messages').innerHTML = '';
    }

    updateTitleWithPings();
    renderMembers(state.currentChannel);
    state.switchingServer = false;
}

async function saveServer(server) {
    if (server.url === 'dms.mistium.com') return;
    if (!state.unreadCountsByServer[server.url]) state.unreadCountsByServer[server.url] = 0;
    const existing = state.servers.find(s => s.url === server.url);
    if (!existing) {
        state.servers.push(server);
    } else {
        Object.assign(existing, server);
    }
    await saveServers();
    renderGuildSidebar();
}

function connectToServer(serverUrl) {
    const url = serverUrl || state.serverUrl;

    if (reconnectTimeouts[url]) { clearTimeout(reconnectTimeouts[url]); reconnectTimeouts[url] = null; }
    reconnectAttempts[url] = 0;

    const authScreen = document.getElementById('auth-screen');
    const isAuthScreenVisible = authScreen && authScreen.classList.contains('active');
    const isFirstConnection = !Object.values(wsConnections).some(conn => conn && conn.status === 'connected');

    if (isFirstConnection || isAuthScreenVisible) {
        if (authScreen) authScreen.classList.remove('active');
        const chatScreen = document.getElementById('chat-screen');
        if (chatScreen) chatScreen.classList.add('active');
    }

    // Close existing connection cleanly without deleting from wsConnections yet
    if (wsConnections[url]) {
        console.warn(`Closing existing connection to ${url} before reconnecting`);
        const existing = wsConnections[url];
        if (existing.socket && existing.closeHandler) existing.socket.removeEventListener('close', existing.closeHandler);
        if (existing.socket && existing.errorHandler) existing.socket.removeEventListener('error', existing.errorHandler);
        if (existing.socket && existing.socket.readyState !== WebSocket.CLOSED) existing.socket.close();
        wsConnections[url] = null;
    }

    wsStatus[url] = 'connecting';
    const ws = new WebSocket(`wss://${url}`);

    // Helper to clean up pending state on disconnect
    const cleanupPendingState = () => {
        delete state.authenticatingByServer[url];
        authRetries[url] = 0;
        if (authRetryTimeouts[url]) { clearTimeout(authRetryTimeouts[url]); authRetryTimeouts[url] = null; }
        Object.keys(state.pendingMessageFetchesByChannel).forEach(key => {
            if (key.startsWith(`${url}:`)) delete state.pendingMessageFetchesByChannel[key];
        });
        Object.keys(state.pendingReplyFetches).forEach(key => {
            if (key.startsWith(`${url}:`)) delete state.pendingReplyFetches[key];
        });
        Object.keys(pendingReplyTimeouts).forEach(key => {
            if (key.startsWith(`${url}:`)) { clearTimeout(pendingReplyTimeouts[key]); delete pendingReplyTimeouts[key]; }
        });
        delete state.loadingChannelsByServer[url];
    };

    const closeHandler = function () {
        console.log(`WebSocket closed for ${url}`);
        wsConnections[url].status = 'error';
        wsStatus[url] = 'error';
        cleanupPendingState();
        renderGuildSidebar();
        if (url === state.serverUrl) { console.log(`Auto-reconnecting to ${url}...`); scheduleReconnect(url); }
    };

    const errorHandler = function (error) {
        console.error(`WebSocket error for ${url}:`, error);
        wsConnections[url].status = 'error';
        wsStatus[url] = 'error';
        cleanupPendingState();
        renderGuildSidebar();
        if (state.serverUrl === url) showError('Connection error');
    };

    const messageHandler = function (event) {
        handleMessage(JSON.parse(event.data), url);
    };

    const openHandler = function () {
        console.log(`WebSocket connected to ${url}`);
        wsConnections[url].status = 'connected';
        wsStatus[url] = 'connected';
        renderGuildSidebar();
        if (reconnectAttempts[url]) reconnectAttempts[url] = 0;
    };

    wsConnections[url] = { socket: ws, status: 'connecting', closeHandler, errorHandler, messageHandler, openHandler };
    ws.addEventListener('open', openHandler);
    ws.addEventListener('message', messageHandler);
    ws.addEventListener('error', errorHandler);
    ws.addEventListener('close', closeHandler);
}

function connectToAllServers() {
    state.servers.forEach(server => connectToServer(server.url));
    if (!wsConnections['dms.mistium.com']) connectToServer('dms.mistium.com');
    if (state.serverUrl && !wsConnections[state.serverUrl]) connectToServer(state.serverUrl);
}

async function connectToPriorityServer(serverUrl) {
    console.log(`[Priority] Connecting to ${serverUrl} first...`);
    if (!wsConnections[serverUrl] || wsConnections[serverUrl].status !== 'connected') connectToServer(serverUrl);
    await waitForServerReady(serverUrl);
    console.log(`[Priority] ${serverUrl} is ready`);
}

async function waitForServerReady(serverUrl, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const conn = wsConnections[serverUrl];
        if (conn && conn.status === 'connected' && state.currentUserByServer[serverUrl]) return true;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.warn(`[Priority] Timeout waiting for ${serverUrl} to be ready`);
    return false;
}

function connectToOtherServers() {
    console.log('[Background] Connecting to remaining servers...');
    const priorityServer = state.priorityServer || 'dms.mistium.com';
    const connectInBackground = () => {
        state.servers.forEach((server, index) => {
            if (server.url !== priorityServer && !wsConnections[server.url]) {
                setTimeout(() => { console.log(`[Background] Connecting to ${server.url}`); connectToServer(server.url); }, 100 + (index * 50));
            }
        });
        if (priorityServer !== 'dms.mistium.com' && !wsConnections['dms.mistium.com']) {
            setTimeout(() => { console.log('[Background] Connecting to dms.mistium.com'); connectToServer('dms.mistium.com'); }, 150);
        }
    };
    if ('requestIdleCallback' in window) {
        requestIdleCallback(connectInBackground, { timeout: 3000 });
    } else {
        setTimeout(connectInBackground, 500);
    }
}

const reconnectAttempts = {};
const reconnectTimeouts = {};
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;

function scheduleReconnect(serverUrl) {
    if (reconnectTimeouts[serverUrl]) clearTimeout(reconnectTimeouts[serverUrl]);
    if (!reconnectAttempts[serverUrl]) reconnectAttempts[serverUrl] = 0;
    reconnectAttempts[serverUrl]++;

    if (reconnectAttempts[serverUrl] > MAX_RECONNECT_ATTEMPTS) {
        console.error(`Max reconnection attempts reached for ${serverUrl}`);
        showError(`Failed to reconnect to ${serverUrl}. Click the server to retry.`);
        reconnectAttempts[serverUrl] = 0;
        return;
    }

    const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts[serverUrl] - 1), 30000);
    console.log(`Scheduling reconnect to ${serverUrl} in ${delay}ms (attempt ${reconnectAttempts[serverUrl]}/${MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimeouts[serverUrl] = setTimeout(() => {
        reconnectTimeouts[serverUrl] = null;
        if (serverUrl === state.serverUrl && (!wsConnections[serverUrl] || wsConnections[serverUrl].status !== 'connected')) {
            connectToServer(serverUrl);
        } else {
            reconnectAttempts[serverUrl] = 0;
        }
    }, delay);
}

async function generateValidator(validatorKey) {
    try {
        const response = await fetch(`https://api.rotur.dev/generate_validator?key=${validatorKey}&auth=${state.token}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.validator) throw new Error('No validator returned from API');
        return data.validator;
    } catch (error) {
        console.error(`Failed to generate validator:`, error);
        throw error;
    }
}

async function authenticateServer(serverUrl) {
    if (state.authenticatingByServer[serverUrl]) return;
    state.authenticatingByServer[serverUrl] = true;

    const conn = wsConnections[serverUrl];
    if (!conn || conn.status !== 'connected') {
        console.warn(`Cannot authenticate ${serverUrl}: connection not ready`);
        delete state.authenticatingByServer[serverUrl];
        return;
    }

    const validatorKey = serverValidatorKeys[serverUrl];
    if (!validatorKey) {
        console.error(`No validator key for ${serverUrl}`);
        delete state.authenticatingByServer[serverUrl];
        return;
    }

    try {
        const validator = await generateValidator(validatorKey);
        state.validatorsByServer[serverUrl] = validator;
        if (conn.socket.readyState === WebSocket.OPEN) {
            wsSend({ cmd: 'auth', validator }, serverUrl);
        } else {
            console.warn(`WebSocket not ready, retrying auth for ${serverUrl}...`);
            setTimeout(() => {
                const retry = wsConnections[serverUrl];
                if (retry && retry.status === 'connected') wsSend({ cmd: 'auth', validator: state.validatorsByServer[serverUrl] }, serverUrl);
            }, 500);
        }
    } catch (error) {
        console.error(`Authentication failed for ${serverUrl}:`, error);
        delete state.authenticatingByServer[serverUrl];
    }
}

async function retryAuthentication(serverUrl) {
    const maxRetries = 3;
    if (authRetryTimeouts[serverUrl]) { clearTimeout(authRetryTimeouts[serverUrl]); authRetryTimeouts[serverUrl] = null; }
    if (!authRetries[serverUrl]) authRetries[serverUrl] = 0;
    authRetries[serverUrl]++;

    if (authRetries[serverUrl] >= maxRetries) {
        console.error(`Max authentication retries reached for ${serverUrl}`);
        delete state.authenticatingByServer[serverUrl];
        delete authRetryTimeouts[serverUrl];
        if (wsConnections[serverUrl]) {
            wsConnections[serverUrl].status = 'error';
            wsStatus[serverUrl] = 'error';
        }
        renderGuildSidebar();
        if (state.serverUrl === serverUrl) {
            showError('Authentication failed. Reconnecting...');
            if (wsConnections[serverUrl]) {
                const socket = wsConnections[serverUrl].socket;
                if (socket.readyState !== WebSocket.CLOSED) socket.close();
            }
            scheduleReconnect(serverUrl);
        }
        return;
    }

    console.log(`Retrying authentication for ${serverUrl} (attempt ${authRetries[serverUrl]}/${maxRetries})`);
    await new Promise(resolve => { authRetryTimeouts[serverUrl] = setTimeout(resolve, 1000 * authRetries[serverUrl]); });
    delete authRetryTimeouts[serverUrl];
    delete state.authenticatingByServer[serverUrl];
    await authenticateServer(serverUrl);
}

const pingRegex = /@[^ ,.\W]+([ \n]|$)/g;

async function handleMessage(msg, serverUrl) {
    switch (msg.cmd || msg.type) {
        case 'handshake': {
            if (!state.channelsByServer[serverUrl]) state.channelsByServer[serverUrl] = [];
            if (!state.messagesByServer[serverUrl]) state.messagesByServer[serverUrl] = {};
            if (!state.pingsByServer[serverUrl]) state.pingsByServer[serverUrl] = {};
            if (!state.usersByServer[serverUrl]) state.usersByServer[serverUrl] = {};

            const server = msg.val.server;
            server.url = serverUrl;
            if (serverUrl === 'dms.mistium.com') {
                server.name = 'Direct Messages';
                if (state.server === null) {
                    state.server = server;
                }
            }

            authRetries[serverUrl] = 0;
            if (authRetryTimeouts[serverUrl]) { clearTimeout(authRetryTimeouts[serverUrl]); authRetryTimeouts[serverUrl] = null; }

            serverValidatorKeys[serverUrl] = msg.val.validator_key;
            saveServer(server);

            const serverChannelHeader = document.getElementById('server-channel-header');
            if (serverUrl === 'dms.mistium.com') {
                if (serverChannelHeader) serverChannelHeader.style.display = 'none';
                fetchMyAccountData();
            } else {
                const dmFriendsContainer = document.getElementById('dm-friends-container');
                const messagesEl = document.getElementById('messages');
                if (dmFriendsContainer) dmFriendsContainer.style.display = 'none';
                if (messagesEl) messagesEl.style.display = 'flex';
            }
            renderGuildSidebar();
            updateGuildActiveState();
            authenticateServer(serverUrl);
            break;
        }
        case 'ready':
            if (!state.usersByServer[serverUrl]) state.usersByServer[serverUrl] = {};
            state.currentUserByServer[serverUrl] = msg.user;
            const existingUser = getUserByUsernameCaseInsensitive(msg.user.username, serverUrl);
            if (existingUser) { Object.assign(existingUser, msg.user); } else { state.usersByServer[serverUrl][msg.user.username] = msg.user; }
            updateUserSection();
            if (serverUrl === 'dms.mistium.com' && state.currentChannel?.name === 'relationships') {
                fetchMyAccountData().then(() => renderDMTabContent(currentDMTab));
            }
            authRetries[serverUrl] = 0;
            if (authRetryTimeouts[serverUrl]) { clearTimeout(authRetryTimeouts[serverUrl]); authRetryTimeouts[serverUrl] = null; }
            break;

        case 'auth_success':
            delete state.authenticatingByServer[serverUrl];
            authRetries[serverUrl] = 0;
            if (authRetryTimeouts[serverUrl]) { clearTimeout(authRetryTimeouts[serverUrl]); authRetryTimeouts[serverUrl] = null; }
            state.loadingChannelsByServer[serverUrl] = true;
            wsSend({ cmd: 'channels_get' }, serverUrl);
            wsSend({ cmd: 'users_list' }, serverUrl);
            wsSend({ cmd: 'users_online' }, serverUrl);
            break;

        case 'channels_get':
            console.log('[DEBUG] channels_get received for server:', serverUrl, 'msg.val:', msg.val);
            state.channelsByServer[serverUrl] = msg.val;
            state.loadingChannelsByServer[serverUrl] = false;

            if (!state.readTimesByServer[serverUrl]) {
                state.readTimesByServer[serverUrl] = {};
            }

            msg.val.forEach(channel => {
                if (channel.last_message && state.readTimesByServer[serverUrl][channel.name] === undefined) {
                    state.readTimesByServer[serverUrl][channel.name] = 0;
                }
            });

            renderGuildSidebar();
            if (state.serverUrl === serverUrl) {
                renderChannels();
                if (!state.currentChannel && state.channels.length > 0 && serverUrl !== 'dms.mistium.com') {
                    const lastChannelName = state.lastChannelByServer[serverUrl];
                    const lastChannel = lastChannelName ? state.channels.find(c => c.name === lastChannelName) : null;
                    selectChannel(lastChannel || state.channels[0]);
                }
                if (serverUrl === 'dms.mistium.com' && !state.currentChannel) selectHomeChannel();
                if (state.pendingChannelSelectsByServer[serverUrl] && serverUrl !== 'dms.mistium.com') {
                    const pendingChannel = state.pendingChannelSelectsByServer[serverUrl];
                    delete state.pendingChannelSelectsByServer[serverUrl];
                    const actualChannel = state.channels.find(c => c.name === pendingChannel.name);
                    if (actualChannel) selectChannel(actualChannel);
                }
            }
            break;

        case 'users_list':
            if (!state.usersByServer[serverUrl]) state.usersByServer[serverUrl] = {};
            for (const user of msg.users) {
                const existing = getUserByUsernameCaseInsensitive(user.username, serverUrl);
                if (existing) { Object.assign(existing, user); } else { state.usersByServer[serverUrl][user.username] = user; }
            }
            renderMembers(state.currentChannel);
            break;

        case 'users_online':
            if (!state.usersByServer[serverUrl]) state.usersByServer[serverUrl] = {};
            const onlineUsernames = new Set(msg.users.map(u => u.username.toLowerCase()));
            for (const user of msg.users) {
                const existing = getUserByUsernameCaseInsensitive(user.username, serverUrl);
                if (existing) existing.status = 'online';
            }
            for (const username in state.usersByServer[serverUrl]) {
                if (!onlineUsernames.has(username.toLowerCase())) state.usersByServer[serverUrl][username].status = 'offline';
            }
            renderMembers(state.currentChannel);
            updateAccountProfileStatusIndicator();
            break;

        case "user_connect":
        case "user_disconnect":
            wsSend({ cmd: 'users_online' }, serverUrl);
            break;

        case 'messages_get': {
            const ch = msg.channel;
            const channelKey = `${serverUrl}:${ch}`;
            if (!state.messagesByServer[serverUrl]) state.messagesByServer[serverUrl] = {};
            const existing = state.messagesByServer[serverUrl][ch];
            const req = state._loadingOlder?.[ch];
            const isOlder = !!req && req.start > 0;
            if (isOlder && existing) {
                {
                    const merged = [...msg.messages, ...existing];
                    const seen = new Set();
                    state.messagesByServer[serverUrl][ch] = merged
                        .filter(m => {
                            if (seen.has(m.id)) return false;
                            seen.add(m.id);
                            return true;
                        });
                }
                state._olderStart[ch] = req.start;
                state._loadingOlder[ch] = null;
                state._olderLoading = false;
            } else {
                state.messagesByServer[serverUrl][ch] = msg.messages;
                if (state.pendingMessageFetchesByChannel[channelKey]) delete state.pendingMessageFetchesByChannel[channelKey];
                if (state.serverUrl === serverUrl && state.currentChannel && ch === state.currentChannel?.name) {
                    const shouldForceScroll = state._pendingChannelSwitch === channelKey;
                    renderMessages(shouldForceScroll);
                    state._pendingChannelSwitch = null;
                }
            }
            break;
        }

        case 'message_new':
            if (!state.messagesByServer[serverUrl] || !state.messagesByServer[serverUrl][msg.channel]) return;
            state.messagesByServer[serverUrl][msg.channel].push(msg.message);

            const channels = state.channelsByServer[serverUrl];
            if (channels) {
                const channel = channels.find(c => c.name === msg.channel);
                if (channel && msg.message.timestamp) {
                    channel.last_message = msg.message.timestamp;
                }
            }

            if (state.serverUrl !== serverUrl || msg.channel !== state.currentChannel?.name) {
                if (!state.unreadCountsByServer[serverUrl]) state.unreadCountsByServer[serverUrl] = 0;
                state.unreadCountsByServer[serverUrl]++;
                const channelKey = `${serverUrl}:${msg.channel}`;
                if (!state.unreadByChannel[channelKey]) state.unreadByChannel[channelKey] = 0;
                state.unreadByChannel[channelKey]++;
                if (serverUrl === 'dms.mistium.com' && msg.message.user !== state.currentUser?.username) {
                    addDMServer(msg.message.user, msg.channel);
                    playPingSound();
                }
                if (state.serverUrl === serverUrl) requestAnimationFrame(() => renderChannels());
                renderGuildSidebar();
            }

            {
                const typingServer = state.typingUsersByServer[serverUrl];
                if (typingServer && typingServer[msg.channel]) {
                    const typing = typingServer[msg.channel];
                    if (typing.has(msg.message.user)) {
                        typing.delete(msg.message.user);
                        const timeoutsServer = state.typingTimeoutsByServer[serverUrl];
                        if (timeoutsServer && timeoutsServer[msg.channel]) {
                            const timeouts = timeoutsServer[msg.channel];
                            if (timeouts.has(msg.message.user)) { clearTimeout(timeouts.get(msg.message.user)); timeouts.delete(msg.message.user); }
                        }
                        updateChannelListTyping(msg.channel);
                        if (serverUrl === state.serverUrl && msg.channel === state.currentChannel?.name) updateTypingIndicator();
                    }
                }
            }

            if (state.currentUser && msg.message.user !== state.currentUser.username) {
                const matches = msg.message.content.toLowerCase().match(pingRegex);
                if (matches) {
                    const pings = matches.filter(m => m.trim().toLowerCase() === '@' + state.currentUser.username.toLowerCase());
                    if (pings.length > 0) {
                        if (state.serverUrl !== serverUrl || msg.channel !== state.currentChannel?.name) {
                            if (!state.unreadPings[msg.channel]) state.unreadPings[msg.channel] = 0;
                            state.unreadPings[msg.channel]++;
                            if (state.serverUrl === serverUrl) renderChannels();
                        }
                        playPingSound();
                        const cleanContent = msg.message.content.replace(/<[^>]*>/g, '');
                        const notifBody = cleanContent.length > 100 ? cleanContent.substring(0, 100) + '...' : cleanContent;
                        showNotification(`${msg.message.user} mentioned you in #${msg.channel}`, notifBody, msg.channel);
                        updateTitleWithPings();
                        if (!state.serverPingsByServer[serverUrl]) state.serverPingsByServer[serverUrl] = 0;
                        state.serverPingsByServer[serverUrl]++;
                        renderGuildSidebar();
                    }
                }
                if (msg.message.reply_to && state.messagesByServer[serverUrl]?.[msg.channel]) {
                    const originalMsg = state.messagesByServer[serverUrl][msg.channel].find(m => m.id === msg.message.reply_to.id);
                    if (originalMsg && originalMsg.user === state.currentUser.username) {
                        if (state.serverUrl !== serverUrl || msg.channel !== state.currentChannel?.name) {
                            if (!state.unreadReplies[msg.channel]) state.unreadReplies[msg.channel] = 0;
                            state.unreadReplies[msg.channel]++;
                            if (state.serverUrl === serverUrl) renderChannels();
                        }
                        playPingSound();
                        const cleanContent = msg.message.content.replace(/<[^>]*>/g, '');
                        const notifBody = cleanContent.length > 100 ? cleanContent.substring(0, 100) + '...' : cleanContent;
                        showNotification(`${msg.message.user} replied to your message in #${msg.channel}`, notifBody, msg.channel);
                        updateTitleWithPings();
                    }
                }
            }

            if (state.serverUrl === serverUrl && msg.channel === state.currentChannel?.name) appendMessage(msg.message);
            break;

        case 'message_get': {
            const replyKey = `${serverUrl}:${msg.message.id}`;
            if (pendingReplyTimeouts[replyKey]) { clearTimeout(pendingReplyTimeouts[replyKey]); delete pendingReplyTimeouts[replyKey]; }
            if (state.pendingReplyFetches[replyKey]) {
                state.pendingReplyFetches[replyKey].forEach((pending) => {
                    const replyUser = getUserByUsernameCaseInsensitive(msg.message.user) || { username: msg.message.user };
                    const existingEl = document.querySelector(`[data-reply-to-id="${msg.message.id}"][data-msg-id="${pending.element.dataset.msgId}"]`);
                    if (existingEl) {
                        existingEl.className = 'message-reply';
                        existingEl.style.cursor = 'pointer';
                        existingEl.innerHTML = '';
                        existingEl.appendChild(getAvatar(replyUser.username, 'small'));
                        const replyText = document.createElement('div');
                        const usernameSpan = document.createElement('span');
                        usernameSpan.className = 'reply-username';
                        usernameSpan.textContent = replyUser.username;
                        usernameSpan.style.cursor = 'pointer';
                        replyText.appendChild(usernameSpan);
                        const contentSpan = document.createElement('span');
                        contentSpan.className = 'reply-content';
                        contentSpan.textContent = msg.message.content.length > 50 ? msg.message.content.substring(0, 50) + '...' : msg.message.content;
                        replyText.appendChild(contentSpan);
                        existingEl.appendChild(replyText);
                        usernameSpan.addEventListener('click', (e) => { e.stopPropagation(); openAccountModal(replyUser.username); });
                        existingEl.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const originalMessageEl = document.querySelector(`[data-msg-id="${msg.message.id}"]`);
                            if (originalMessageEl) {
                                originalMessageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                originalMessageEl.classList.add('highlight-message');
                                setTimeout(() => originalMessageEl.classList.remove('highlight-message'), 2000);
                            }
                        });
                    }
                });
                delete state.pendingReplyFetches[replyKey];
            }
            break;
        }

        case 'message_edit': {
            if (!state.messagesByServer[serverUrl]?.[msg.channel]) break;
            const message = state.messagesByServer[serverUrl][msg.channel].find(m => m.id === msg.id);
            if (message) { message.content = msg.content; message.edited = true; message.editedAt = Date.now(); }
            if (state.serverUrl === serverUrl && msg.channel === state.currentChannel?.name) updateMessageContent(msg.id, msg.content);
            break;
        }

        case 'message_delete': {
            if (!state.messagesByServer[serverUrl]?.[msg.channel]) break;
            state.messagesByServer[serverUrl][msg.channel] = state.messagesByServer[serverUrl][msg.channel].filter(m => m.id !== msg.id);
            if (state.serverUrl === serverUrl && msg.channel === state.currentChannel?.name) renderMessages();
            break;
        }

        case 'typing': {
            const { channel, user } = msg;
            if (user === state.currentUser?.username) break;
            if (!state.typingUsersByServer[serverUrl]) state.typingUsersByServer[serverUrl] = {};
            if (!state.typingTimeoutsByServer[serverUrl]) state.typingTimeoutsByServer[serverUrl] = {};
            if (!state.typingUsersByServer[serverUrl][channel]) state.typingUsersByServer[serverUrl][channel] = new Map();
            if (!state.typingTimeoutsByServer[serverUrl][channel]) state.typingTimeoutsByServer[serverUrl][channel] = new Map();

            const typingMap = state.typingUsersByServer[serverUrl][channel];
            const timeoutMap = state.typingTimeoutsByServer[serverUrl][channel];
            typingMap.set(user, Date.now() + 10000);

            updateChannelListTyping(channel);
            if (channel === state.currentChannel?.name) updateTypingIndicator();

            if (timeoutMap.has(user)) clearTimeout(timeoutMap.get(user));
            timeoutMap.set(user, setTimeout(() => {
                const currentExpiry = typingMap.get(user);
                if (currentExpiry && currentExpiry <= Date.now()) {
                    typingMap.delete(user);
                    timeoutMap.delete(user);
                    updateChannelListTyping(channel);
                    if (channel === state.currentChannel?.name) updateTypingIndicator();
                }
            }, 10000));
            break;
        }

        case 'rate_limit':
            if (serverUrl === state.serverUrl) showRateLimit(msg.length);
            break;
        case 'error':
            if (msg.src === 'message_get') break;
            showError(msg.val);
            break;
        case 'auth_error':
            console.error(`Authentication error for ${serverUrl}:`, msg.val);
            retryAuthentication(serverUrl);
            break;

        case 'message_react_add': {
            if (!state.messagesByServer[serverUrl]?.[msg.channel]) break;
            const message = state.messagesByServer[serverUrl][msg.channel].find(m => m.id === msg.id);
            if (!message) break;
            if (!message.reactions) message.reactions = {};
            if (!message.reactions[msg.emoji]) message.reactions[msg.emoji] = [];
            const user = msg.from || msg.user || 'unknown';
            if (!message.reactions[msg.emoji].includes(user)) message.reactions[msg.emoji].push(user);
            if (state.serverUrl === serverUrl && msg.channel === state.currentChannel?.name) updateMessageReactions(msg.id);
            break;
        }

        case 'message_react_remove': {
            if (!state.messagesByServer[serverUrl]?.[msg.channel]) break;
            const message = state.messagesByServer[serverUrl][msg.channel].find(m => m.id === msg.id);
            if (!message?.reactions?.[msg.emoji]) break;
            const users = message.reactions[msg.emoji];
            const idx = users.indexOf(msg.from);
            if (idx > -1) users.splice(idx, 1);
            if (users.length === 0) delete message.reactions[msg.emoji];
            if (state.serverUrl === serverUrl && msg.channel === state.currentChannel?.name) updateMessageReactions(msg.id);
            break;
        }

        case 'voice_user_joined': if (voiceManager) voiceManager.handleUserJoined(msg); break;
        case 'voice_user_left': if (voiceManager) voiceManager.handleUserLeft(msg); break;
        case 'voice_user_updated': if (voiceManager) voiceManager.handleUserUpdated(msg); break;

        case 'roles_list':
            if (window.serverSettingsState && msg.roles) {
                window.serverSettingsState.roles = msg.roles;
                if (typeof window.renderRoles === 'function') window.renderRoles();
            }
            break;

        case 'channel_create':
        case 'channel_delete':
        case 'channel_move':
        case 'channel_update':
            if (msg.created || msg.deleted || msg.moved || msg.updated) {
                if (state.channelsByServer[serverUrl]) wsSend({ cmd: 'channels_get' }, serverUrl);
            }
            break;

        case 'role_create':
        case 'role_delete':
        case 'role_update':
            if ((msg.created || msg.deleted || msg.updated) && window.serverSettingsState) {
                wsSend({ cmd: 'roles_list' }, serverUrl);
            }
            break;

        case 'user_roles_add':
        case 'user_roles_remove':
            if ((msg.added || msg.removed) && state.serverUrl === serverUrl) wsSend({ cmd: 'users_list' }, serverUrl);
            break;
    }
}

function updateTypingIndicator() {
    const typingEl = document.getElementById("typing");
    if (!typingEl) return;
    const channel = state.currentChannel?.name;
    if (!channel) return;
    const typingMap = state.typingUsersByServer[state.serverUrl]?.[channel];
    if (!typingMap) return;

    const now = Date.now();
    for (const [user, expiry] of typingMap) { if (expiry < now) typingMap.delete(user); }
    const users = [...typingMap.keys()];

    if (users.length === 0) { typingEl.textContent = ""; typingEl.style.visibility = 'hidden'; return; }
    let text = users.length === 1 ? `${users[0]} is typing...` : users.length === 2 ? `${users[0]} and ${users[1]} are typing...` : `${users.length} people are typing...`;
    typingEl.textContent = text;
    typingEl.style.display = '';
    typingEl.style.visibility = 'visible';
}

function wsSend(data, serverUrl) {
    const url = serverUrl || state.serverUrl;
    const connection = wsConnections[url];
    if (connection && connection.socket && connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(JSON.stringify(data));
        return true;
    }
    console.warn(`WebSocket not open for ${url}, message not sent:`, data);
    return false;
}
window.wsSend = wsSend;

function updateChannelListTyping(channelName) {
    for (const item of document.querySelectorAll('.channel-item')) {
        const nameEl = item.querySelector('span:nth-child(2)');
        if (!nameEl || nameEl.textContent !== channelName) continue;
        let indicator = item.querySelector('.channel-typing-indicator');
        const typingMap = state.typingUsersByServer[state.serverUrl]?.[channelName];
        if (typingMap && typingMap.size > 0) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'channel-typing-indicator';
                indicator.innerHTML = `<div class="channel-typing-dot"></div><div class="channel-typing-dot"></div><div class="channel-typing-dot"></div>`;
                item.appendChild(indicator);
            }
        } else if (indicator) {
            indicator.remove();
        }
        break;
    }
}

async function selectChannel(channel) {
    updateCurrentChannelReadTime();
    if (!channel) return;
    const channelKey = `${state.serverUrl}:${channel.name}`;
    if (state.pendingMessageFetchesByChannel[channelKey]) return;

    console.log(`selectChannel: server=${state.serverUrl}, channel=${channel.name}`);

    if (channel.name !== 'notes' && channel.name !== 'new_message' && channel.name !== 'home' && channel.name !== 'relationships' && (!state.channelsByServer[state.serverUrl] || !state.channelsByServer[state.serverUrl].find(c => c.name === channel.name))) {
        console.warn(`Channel ${channel.name} not found in current server ${state.serverUrl}`);
        return;
    }

    if (state.serverUrl === 'dms.mistium.com' && channel.name === 'notes') {
        state.currentChannel = { name: 'notes', display_name: 'Notes' };
        const messagesEl = document.getElementById('messages');
        const dmFriendsContainer = document.getElementById('dm-friends-container');
        const inputArea = document.querySelector('.input-area');
        const membersList = document.getElementById('members-list');
        const typingEl = document.getElementById('typing');
        const serverChannelHeader = document.getElementById('server-channel-header');

        if (messagesEl) {
            messagesEl.style.display = 'block';
            messagesEl.innerHTML = '';
        }
        if (dmFriendsContainer) dmFriendsContainer.style.display = 'none';
        if (inputArea) inputArea.style.display = 'flex';
        if (membersList) membersList.style.display = 'none';
        if (typingEl) typingEl.style.display = 'none';
        if (serverChannelHeader) serverChannelHeader.style.display = 'none';

        const channelNameEl = document.getElementById('channel-name');
        channelNameEl.innerHTML = '';
        channelNameEl.appendChild(document.createTextNode('#'));
        channelNameEl.appendChild(document.createTextNode('Notes'));

        const mainHeaderChannelName = document.getElementById('main-header-channel-name');
        if (mainHeaderChannelName) mainHeaderChannelName.textContent = 'Notes';

        const mainMessagesHeader = document.getElementById('main-messages-header');
        if (mainMessagesHeader) mainMessagesHeader.style.display = 'none';

        if (state.unreadPings[channel.name]) delete state.unreadPings[channel.name];
        if (state.unreadReplies[channel.name]) delete state.unreadReplies[channel.name];
        renderChannels();

        document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
        const noteItem = Array.from(document.querySelectorAll('.channel-item')).find(el => el.querySelector('[data-channel-name]')?.dataset.channelName === 'notes');
        if (noteItem) noteItem.classList.add('active');

        if (!state.messagesByServer[state.serverUrl]) state.messagesByServer[state.serverUrl] = {};
        if (!state.messagesByServer[state.serverUrl][channel.name]) state.messagesByServer[state.serverUrl][channel.name] = [];

        if (window.notesChannel) {
            try {
                const savedNotes = await window.notesChannel.getAllMessages();
                state.messagesByServer[state.serverUrl][channel.name] = savedNotes.map(note => ({
                    content: note.content,
                    user: note.user || 'you',
                    timestamp: note.timestamp,
                    created_at: note.timestamp ? new Date(note.timestamp * 1000).toISOString() : new Date().toISOString(),
                    id: note.key
                }));
            } catch (e) { console.error('Failed to load notes from IndexedDB:', e); }
        }
        renderMessages();
        return;
    }

    if (state.serverUrl === 'dms.mistium.com' && channel.name === 'cmds') {
        console.log('Redirecting from cmds to Home channel');
        selectHomeChannel();
        return;
    }

    state.currentChannel = channel;
    state._olderStart[channel.name] = 0;
    state._olderCooldown[channel.name] = 0;
    clearRateLimit();

    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '<div class="loading-throbber"></div>';
    messagesContainer.style.display = 'flex';

    const dmFriendsContainer = document.getElementById('dm-friends-container');
    if (dmFriendsContainer) dmFriendsContainer.style.display = 'none';
    const inputArea = document.querySelector('.input-area');
    if (inputArea) inputArea.style.display = 'flex';

    const serverChannelHeader = document.getElementById('server-channel-header');
    const membersList = document.getElementById('members-list');
    const isExcludedChannel = channel.name === 'home' || channel.name === 'relationships';

    if (state.serverUrl === 'dms.mistium.com') {
        if (serverChannelHeader) serverChannelHeader.style.display = 'none';
    }
    if (membersList) membersList.style.display = isExcludedChannel ? 'none' : '';

    const channelNameEl = document.getElementById('channel-name');
    channelNameEl.innerHTML = '';
    channelNameEl.appendChild(document.createTextNode('#'));
    if (channel.icon) {
        const icon = document.createElement('img');
        icon.src = channel.icon;
        Object.assign(icon.style, { width: '16px', height: '16px', margin: '0 4px', objectFit: 'contain', verticalAlign: 'middle' });
        channelNameEl.appendChild(icon);
    }
    channelNameEl.appendChild(document.createTextNode(getChannelDisplayName(channel)));

    const mainHeaderChannelName = document.getElementById('main-header-channel-name');
    if (mainHeaderChannelName) {
        mainHeaderChannelName.textContent = getChannelDisplayName(channel);
    }

    const mainMessagesHeader = document.getElementById('main-messages-header');
    if (mainMessagesHeader) {
        mainMessagesHeader.style.display = '';
    }

    if (state.unreadPings[channel.name]) delete state.unreadPings[channel.name];

    Object.keys(state.pendingMessageFetchesByChannel).forEach(key => {
        if (key !== channelKey && key.startsWith(`${state.serverUrl}:`)) delete state.pendingMessageFetchesByChannel[key];
    });

    if (state.unreadByChannel[channelKey]) {
        state.unreadCountsByServer[state.serverUrl] = Math.max(0, (state.unreadCountsByServer[state.serverUrl] || 0) - state.unreadByChannel[channelKey]);
        delete state.unreadByChannel[channelKey];
        renderGuildSidebar();
    }

    if (state.serverUrl === 'dms.mistium.com') {
        const ignoredChannels = ['home', 'relationships', 'notes', 'cmds', 'new_message'];
        if (!ignoredChannels.includes(channel.name)) {
            const initialLength = state.dmServers.length;
            state.dmServers = state.dmServers.filter(dm => dm.channel !== channel.name);
            if (state.dmServers.length !== initialLength) {
                localStorage.setItem('originchats_dm_servers', JSON.stringify(state.dmServers));
                renderGuildSidebar();
            }
        }
    }

    renderChannels();

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const targetItem = Array.from(document.querySelectorAll('.channel-item')).find(el => el.querySelector('[data-channel-name]')?.textContent === channel.name);
    if (targetItem) targetItem.classList.add('active');

state._pendingChannelSwitch = channelKey;
  state.autoScrollEnabled = true;
  if (!state.messagesByServer[state.serverUrl]?.[channel.name]) {
    state.pendingMessageFetchesByChannel[channelKey] = true;
    wsSend({ cmd: 'messages_get', channel: channel.name }, state.serverUrl);
  } else {
    renderMessages();
    state._pendingChannelSwitch = null;
  }

    renderMembers(channel);
    updateTypingIndicator();

    window.canSendMessages = checkPermission(channel.permissions?.send || [], state.currentUser.roles);
    const textbox = document.getElementById("message-input");
    textbox.value = "";
    textbox.placeholder = window.canSendMessages ? `Type a message...` : `Cannot send messages here.`;
    textbox.disabled = !window.canSendMessages;
    updateTitleWithPings();
}

function selectHomeChannel() {
    updateCurrentChannelReadTime();
    state.currentChannel = { name: 'home', display_name: 'Home' };

    const channelNameEl = document.getElementById('channel-name');
    channelNameEl.innerHTML = '';
    channelNameEl.appendChild(document.createTextNode('#'));
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'home');
    icon.style.cssText = 'width: 16px; height: 16px; margin: 0 4px; color: var(--text-dim);';
    channelNameEl.appendChild(icon);
    channelNameEl.appendChild(document.createTextNode('Home'));
    if (window.lucide) window.lucide.createIcons({ root: channelNameEl });

    const mainHeaderChannelName = document.getElementById('main-header-channel-name');
    if (mainHeaderChannelName) mainHeaderChannelName.textContent = 'Home';

    const mainMessagesHeader = document.getElementById('main-messages-header');
    if (mainMessagesHeader) mainMessagesHeader.style.display = 'none';

    const serverChannelHeader = document.getElementById('server-channel-header');
    if (serverChannelHeader) serverChannelHeader.style.display = 'none';

    const messagesEl = document.getElementById('messages');
    messagesEl.style.display = 'none';
    const typingEl = document.getElementById('typing');
    if (typingEl) typingEl.style.display = 'none';
    const membersList = document.getElementById('members-list');
    if (membersList) { membersList.innerHTML = ''; membersList.classList.remove('open'); membersList.style.display = 'none'; }
    const inputArea = document.querySelector('.input-area');
    if (inputArea) inputArea.style.display = 'none';
    const dmFriendsContainer = document.getElementById('dm-friends-container');
    if (dmFriendsContainer) dmFriendsContainer.style.display = 'none';

    renderHomeContent();
    renderChannels();

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const homeItem = Array.from(document.querySelectorAll('.channel-item')).find(el => el.querySelector('[data-channel-name]')?.dataset.channelName === 'home');
    if (homeItem) homeItem.classList.add('active');
}

function renderHomeContent() {
    const messagesEl = document.getElementById('messages');
    messagesEl.style.display = 'block';
    messagesEl.innerHTML = '';

    const content = document.createElement('div');
    content.className = 'home-content';

    const welcomeIcon = document.createElement('i');
    welcomeIcon.setAttribute('data-lucide', 'home');
    welcomeIcon.className = 'home-heading-icon';
    content.appendChild(welcomeIcon);

    const welcomeText = document.createElement('h2');
    welcomeText.textContent = 'Welcome Home';
    welcomeText.className = 'home-heading-title';
    content.appendChild(welcomeText);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'What would you like to do?';
    subtitle.className = 'home-heading-subtitle';
    content.appendChild(subtitle);

    const grid = document.createElement('div');
    grid.className = 'home-options-grid';

    const options = [
        { icon: 'users', title: 'Manage Relationships', description: 'View and manage your friends', action: () => selectRelationshipsChannel() },
        { icon: 'user-plus', title: 'Create DM', description: 'Start a new conversation', action: () => { openDMCreateModal(); switchDMCreateTab('dm'); } },
        { icon: 'users', title: 'Create Group', description: 'Start a group conversation', action: () => { openDMCreateModal(); switchDMCreateTab('group'); } },
        { icon: 'plus-circle', title: 'Join Server', description: 'Connect to a new server', action: () => { const url = prompt('Enter server URL to join:'); if (url && url.trim()) addServer(url.trim()); } }
    ];

    options.forEach(option => {
        const card = document.createElement('div');
        card.className = 'home-option-card';
        card.onclick = option.action;

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'home-option-icon';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', option.icon);
        icon.className = '';
        iconWrapper.appendChild(icon);

        const title = document.createElement('h3');
        title.textContent = option.title;
        title.className = 'home-option-title';

        const description = document.createElement('p');
        description.textContent = option.description;
        description.className = 'home-option-description';

        card.appendChild(iconWrapper);
        card.appendChild(title);
        card.appendChild(description);
        grid.appendChild(card);
    });

    content.appendChild(grid);
    messagesEl.appendChild(content);
    if (window.lucide) window.lucide.createIcons({ root: content });
}

function selectRelationshipsChannel() {
    updateCurrentChannelReadTime();
    state.currentChannel = { name: 'relationships', display_name: 'Friends' };

    const channelNameEl = document.getElementById('channel-name');
    channelNameEl.innerHTML = '';
    channelNameEl.appendChild(document.createTextNode('#'));
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'users');
    icon.style.cssText = 'width: 16px; height: 16px; margin: 0 4px; color: var(--text-dim);';
    channelNameEl.appendChild(icon);
    channelNameEl.appendChild(document.createTextNode('Friends'));
    if (window.lucide) window.lucide.createIcons({ root: channelNameEl });

    const mainHeaderChannelName = document.getElementById('main-header-channel-name');
    if (mainHeaderChannelName) mainHeaderChannelName.textContent = 'Friends';

    const mainMessagesHeader = document.getElementById('main-messages-header');
    if (mainMessagesHeader) mainMessagesHeader.style.display = 'none';

    const serverChannelHeader = document.getElementById('server-channel-header');
    if (serverChannelHeader) serverChannelHeader.style.display = 'none';

    const messagesEl = document.getElementById('messages');
    messagesEl.style.display = 'none';
    const typingEl = document.getElementById('typing');
    if (typingEl) typingEl.style.display = 'none';
    const membersList = document.getElementById('members-list');
    if (membersList) { membersList.innerHTML = ''; membersList.classList.remove('open'); membersList.style.display = 'none'; }
    const inputArea = document.querySelector('.input-area');
    if (inputArea) inputArea.style.display = 'none';

    renderDMRelationshipsContent();
    renderChannels();

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const relItem = Array.from(document.querySelectorAll('.channel-item')).find(el => el.querySelector('[data-channel-name]')?.dataset.channelName === 'relationships');
    if (relItem) relItem.classList.add('active');
}

function renderDMRelationshipsContent() {
    const dmFriendsContainer = document.getElementById('dm-friends-container');
    if (!dmFriendsContainer) return;

    dmFriendsContainer.innerHTML = '';
    dmFriendsContainer.style.cssText = 'display: flex; flex-direction: column;';

    const tabs = document.createElement('div');
    tabs.className = 'dm-relationships-tabs';
    tabs.style.cssText = 'display: flex; gap: 8px; padding: 16px 20px 8px 20px; border-bottom: 1px solid var(--border); margin-bottom: 8px;';

    const tabDefs = [
        { label: 'Friends', tab: 'friends' },
        { label: 'Requests', tab: 'requests' },
        { label: 'Blocked', tab: 'blocked' }
    ];

    tabDefs.forEach(({ label, tab }) => {
        const btn = document.createElement('button');
        btn.className = 'dm-tab ' + (currentDMTab === tab ? 'active' : '');
        btn.textContent = label;
        btn.onclick = () => { currentDMTab = tab; updateTabsActive(); renderDMTabContent(tab); };
        tabs.appendChild(btn);
    });

    const content = document.createElement('div');
    content.className = 'dm-relationships-content';
    content.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px 0;';

    dmFriendsContainer.appendChild(tabs);
    dmFriendsContainer.appendChild(content);
    renderDMTabContent(currentDMTab);
}

function updateTabsActive() {
    document.querySelectorAll('.dm-relationships-tabs .dm-tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.toLowerCase().includes(currentDMTab));
    });
}

function formatTimestamp(unix) {
    const now = new Date();
    const messageDate = new Date(unix * 1000);
    const isToday = messageDate.toDateString() === now.toDateString();

    const timeStr = messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) return timeStr;

    const day = messageDate.getDate();
    const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    const month = messageDate.toLocaleString('en-US', { month: 'short' });
    return `${month} ${day}${suffix}, ${messageDate.getFullYear()} at ${timeStr}`;
}

function getFullTimestamp(unix) {
    const d = new Date(unix * 1000);
    const day = d.getDate();
    const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
    return `${day}${suffix} ${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getAvatar(username, size = null) {
    const img = new Image();
    img.className = "avatar" + (size ? ` avatar-${size}` : "");
    img.draggable = false;
    img.loading = 'lazy';

    const defaultAvatar = 'https://avatars.rotur.dev/originChats';
    const avatarUrl = `https://avatars.rotur.dev/${username}`;

    if (state._avatarCache[username]) {
        img.src = state._avatarCache[username];
        return img;
    }

    const tempImg = new Image()

    tempImg.src = avatarUrl;
    tempImg.onload = () => {
        if (!state._avatarLoading[username])
            state._avatarLoading[username] = fetchAvatarBase64(username);
        state._avatarLoading[username]
            .then(dataUri => {
                state._avatarCache[username] = dataUri;
                img.src = dataUri;
            })
            .catch(() => { });
    };
    tempImg.onerror = () => { img.src = defaultAvatar; };
    return img;
}

async function fetchAvatarBase64(username) {
    const response = await fetch(`https://avatars.rotur.dev/${username}`);
    const blob = await response.blob();
    return await blobToDataURL(blob);
}

function setupImageLazyLoading(container) {
    const lazyImages = container.querySelectorAll('.lazy-load-image');
    if (lazyImages.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.imageUrl && img.src !== img.dataset.imageUrl) img.src = img.dataset.imageUrl;
                observer.unobserve(img);
            }
        });
    }, { rootMargin: '100px' });

    lazyImages.forEach((img, index) => {
        if (index < 5) {
            if (img.dataset.imageUrl) img.src = img.dataset.imageUrl;
        } else {
            observer.observe(img);
        }
    });
}

let lastRenderedChannel = null;
let lastUser = null;
let lastTime = 0;
let lastGroup = null;
state._loadingOlder = {};
state._olderLoading = false;
state._olderStart = {};
state._olderCooldown = {};

function scrollToBottom() {
    if (!state.currentChannel) return;
    const messagesEl = document.getElementById('messages');
    if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    updateScrollButton();
}

function updateScrollButton() {
  const scrollBtn = document.getElementById('scroll-to-bottom');
  if (!scrollBtn) return;

  if (!state.currentChannel) {
    scrollBtn.style.display = 'none';
    return;
  }

  const channelKey = `${state.serverUrl}:${state.currentChannel.name}`;
  const container = document.getElementById('messages');

  let isNearBottom;
  if (container) {
    isNearBottom = isElementNearBottom(container, 80);
  } else {
    scrollBtn.style.display = 'none';
    return;
  }

  scrollBtn.style.display = isNearBottom ? 'none' : 'flex';
}

function attachImageScrollHandler(img) {
    const handler = () => scrollToBottom();
    img.addEventListener('load', handler, { once: true });
    img.addEventListener('error', handler, { once: true });
}

window.scrollToBottom = scrollToBottom;
window.attachImageScrollHandler = attachImageScrollHandler;

function updateAllTimestamps() {
    document.querySelectorAll('[data-timestamp]').forEach(el => {
        const timestamp = parseInt(el.dataset.timestamp);
        if (timestamp) { el.textContent = formatTimestamp(timestamp); el.title = getFullTimestamp(timestamp); }
    });
}

let timestampInterval = setInterval(updateAllTimestamps, 60000);

function getDaySeparator(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    let text = date.toDateString() === now.toDateString() ? 'Today'
        : date.toDateString() === yesterday.toDateString() ? 'Yesterday'
            : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const separator = document.createElement('div');
    separator.className = 'day-separator';
    separator.dataset.separatorDate = date.toDateString();
    separator.style.cssText = 'position: relative; z-index: 1; margin: 8px 0;';
    separator.innerHTML = `<span class="day-separator-text">${text}</span>`;
    return separator;
}

function makeMessageElement(msg, isSameUserRecent) {
    const user = getUserByUsernameCaseInsensitive(msg.user) || { username: msg.user };
    const timestamp = formatTimestamp(msg.timestamp);
    const isReply = "reply_to" in msg;
    const isNoGrouping = document.body.classList.contains('no-message-grouping');
    const isHead = !isSameUserRecent || isReply || isNoGrouping;
    const isBlocked = Array.isArray(state.currentUser?.sys?.blocked) && state.currentUser.sys.blocked.includes(msg.user);

    const wrapper = document.createElement('div');
    wrapper.className = isHead ? 'message-group' + (isReply ? ' has-reply' : '') : 'message-single';
    wrapper.dataset.msgId = msg.id;
    wrapper.classList.add('message-enter');

    if (isHead) {
        if (isReply) {
            const bodyContainer = document.createElement('div');
            bodyContainer.className = 'message-group-body';
            bodyContainer.appendChild(getAvatar(msg.user));
            wrapper.appendChild(bodyContainer);
        } else {
            wrapper.appendChild(getAvatar(msg.user));
        }
    }

    const groupContent = document.createElement('div');
    groupContent.className = 'message-group-content';
    if (isHead && isReply) {
        (wrapper.querySelector('.message-group-body') || wrapper).appendChild(groupContent);
    } else {
        wrapper.appendChild(groupContent);
    }

    // Actions bar
    const actionsBar = document.createElement('div');
    actionsBar.className = 'message-actions-bar';
    wrapper.appendChild(actionsBar);

    const reactBtn = document.createElement('button');
    reactBtn.className = 'action-btn';
    reactBtn.setAttribute('data-emoji-anchor', 'true');
    reactBtn.innerHTML = '<i data-lucide="smile"></i>';
    reactBtn.addEventListener('click', (e) => { e.stopPropagation(); openReactionPicker(msg.id, reactBtn); });

    const replyBtn = document.createElement('button');
    replyBtn.className = 'action-btn';
    replyBtn.innerHTML = '<i data-lucide="reply"></i>';
    replyBtn.addEventListener('click', (e) => { e.stopPropagation(); replyToMessage(msg); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn';
    deleteBtn.innerHTML = '<i data-lucide="trash"></i>';
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMessage(msg); });

    actionsBar.appendChild(reactBtn);
    actionsBar.appendChild(replyBtn);
    actionsBar.appendChild(deleteBtn);
    if (window.lucide) window.lucide.createIcons({ root: actionsBar });

    if (isReply) {
        const replyTo = state.messagesByServer[state.serverUrl]?.[state.currentChannel.name]?.find(m => m.id === msg.reply_to.id);
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply';

        if (replyTo) {
            const replyUser = getUserByUsernameCaseInsensitive(replyTo.user) || { username: replyTo.user };
            replyDiv.style.cursor = 'pointer';
            replyDiv.dataset.msgId = msg.id;
            replyDiv.dataset.replyToId = msg.reply_to.id;
            replyDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalMessageEl = document.querySelector(`[data-msg-id="${replyTo.id}"]`);
                if (originalMessageEl) {
                    originalMessageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    originalMessageEl.classList.add('highlight-message');
                    setTimeout(() => originalMessageEl.classList.remove('highlight-message'), 2000);
                }
            });

            const usernameSpan = document.createElement('span');
            usernameSpan.className = 'reply-username';
            usernameSpan.textContent = replyUser.username;
            usernameSpan.style.cursor = 'pointer';
            usernameSpan.addEventListener('click', (e) => { e.stopPropagation(); openAccountModal(replyUser.username); });

            const contentSpan = document.createElement('span');
            contentSpan.className = 'reply-content';
            contentSpan.textContent = replyTo.content.length > 50 ? replyTo.content.substring(0, 50) + '...' : replyTo.content;

            replyDiv.appendChild(getAvatar(replyUser.username, 'small'));
            const replyText = document.createElement('div');
            replyText.appendChild(usernameSpan);
            replyText.appendChild(contentSpan);
            replyDiv.appendChild(replyText);
            wrapper.insertBefore(replyDiv, wrapper.firstChild);
        } else {
            const replyKey = `${state.serverUrl}:${msg.reply_to.id}`;
            if (!state.pendingReplyFetches[replyKey]) state.pendingReplyFetches[replyKey] = [];

            const notFoundDiv = document.createElement('div');
            notFoundDiv.className = 'message-reply reply-not-found';
            const notFoundIcon = document.createElement('div');
            notFoundIcon.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i>';
            const notFoundText = document.createElement('div');
            notFoundText.className = 'reply-username';
            notFoundText.textContent = 'Loading...';
            notFoundDiv.appendChild(notFoundIcon);
            notFoundDiv.appendChild(notFoundText);
            notFoundDiv.dataset.msgId = msg.id;
            notFoundDiv.dataset.replyToId = msg.reply_to.id;

            const timeoutKey = replyKey;
            pendingReplyTimeouts[timeoutKey] = setTimeout(() => {
                delete pendingReplyTimeouts[timeoutKey];
                if (state.pendingReplyFetches[replyKey]) {
                    state.pendingReplyFetches[replyKey].forEach((pending) => {
                        const el = document.querySelector(`[data-reply-to-id="${msg.reply_to.id}"][data-msg-id="${pending.element.dataset.msgId}"]`);
                        if (el) {
                            el.className = 'message-reply reply-not-found';
                            el.innerHTML = '';
                            const xIcon = document.createElement('div');
                            xIcon.innerHTML = '<i data-lucide="x-circle"></i>';
                            const textDiv = document.createElement('div');
                            textDiv.className = 'reply-username';
                            textDiv.textContent = 'Message not found';
                            el.appendChild(xIcon);
                            el.appendChild(textDiv);
                            if (window.lucide) window.lucide.createIcons({ root: xIcon });
                        }
                    });
                    delete state.pendingReplyFetches[replyKey];
                }
            }, 5000);

            state.pendingReplyFetches[replyKey].push({ element: notFoundDiv, channel: state.currentChannel.name });
            wsSend({ cmd: 'message_get', channel: state.currentChannel.name, id: msg.reply_to.id }, state.serverUrl);
            wrapper.insertBefore(notFoundDiv, wrapper.firstChild);
            if (window.lucide) window.lucide.createIcons({ root: notFoundIcon });
        }
    }

    if (isHead) {
        const header = document.createElement('div');
        header.className = 'message-header';
        const usernameEl = document.createElement('span');
        usernameEl.className = 'username';
        usernameEl.textContent = msg.user;
        usernameEl.style.color = user.color || '#fff';
        usernameEl.style.cursor = 'pointer';
        usernameEl.addEventListener('click', (e) => { e.stopPropagation(); openAccountModal(msg.user); });
        const ts = document.createElement('span');
        ts.className = 'timestamp';
        ts.textContent = timestamp;
        ts.dataset.timestamp = msg.timestamp;
        ts.title = getFullTimestamp(msg.timestamp);
        header.appendChild(usernameEl);
        header.appendChild(ts);
        if (msg.edited || msg.editedAt) {
            const editedSpan = document.createElement('span');
            editedSpan.className = 'edited-indicator';
            editedSpan.textContent = '(edited)';
            header.appendChild(editedSpan);
        }
        groupContent.appendChild(header);
    }

    if (isBlocked) {
        const blockedMode = getBlockedMessagesMode();
        const action = getBlockedMessageAction(blockedMode);
        if (action === 'hide') { wrapper.style.display = 'none'; return wrapper; }
        if (action === 'dim') { wrapper.classList.add('blocked-dimmed'); return wrapper; }
        const notice = document.createElement('div');
        notice.className = 'blocked-notice';
        const btn = document.createElement('button');
        btn.className = 'blocked-show-btn';
        btn.textContent = 'Show';
        notice.textContent = 'Message from blocked user – ';
        notice.appendChild(btn);
        btn.addEventListener('click', (e) => { e.stopPropagation(); revealBlockedMessage(wrapper, msg); });
        groupContent.appendChild(notice);
        setupMessageSwipe(wrapper, msg);
        return wrapper;
    }

    const msgText = document.createElement('div');
    msgText.className = 'message-text';
    const embedLinks = [];
    msgText.innerHTML = parseMsg(msg, embedLinks);


    if (embedLinks.length === 1 && isTenorOnlyMessage(embedLinks, msg.content)) {
        msgText.style.display = 'none';
    } else {
        msgText.style.display = '';
        msgText.classList.toggle('emoji-only', isEmojiOnly(msg.content));
    }

    if (window.twemoji) {
        if (msgText) window.twemoji.parse(msgText);
    }

    msgText.querySelectorAll("pre code").forEach(block => {
        try {
            const code = block.textContent;
            block.textContent = code;
            hljs.highlightElement(block);
        } catch (e) {
            console.debug('Highlight error:', e);
        }
    });
    msgText.querySelectorAll("a.potential-image").forEach(link => _processPotentialImageLink(link, groupContent));

    msgText.classList.remove('mentioned');
    if (state.currentUser) {
        const matches = msg.content.match(pingRegex);
        if (matches && matches.filter(m => m.trim().toLowerCase() === '@' + state.currentUser.username.toLowerCase()).length > 0) {
            msgText.classList.add('mentioned');
        }
    }

    const groupContent2 = wrapper.querySelector('.message-group-content');
    if (groupContent2) _processEmbedLinks(embedLinks, groupContent2);

    if (!isHead) {
        const hoverTs = document.createElement('div');
        hoverTs.className = 'hover-timestamp';
        hoverTs.dataset.timestamp = msg.timestamp;
        hoverTs.textContent = formatTimestamp(msg.timestamp);
        if (msg.edited || msg.editedAt) {
            const editedSpan = document.createElement('span');
            editedSpan.className = 'edited-indicator';
            editedSpan.textContent = '(edited)';
            hoverTs.appendChild(editedSpan);
        }
        groupContent.appendChild(hoverTs);
    }

    groupContent.appendChild(msgText);

    msgText.querySelectorAll('.message-image').forEach(img => attachImageErrorFallback(img, img.src || img.dataset.imageUrl));

    window.renderReactions(msg, groupContent);

    setupMessageSwipe(wrapper, msg);

    wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const imgEl = e.target.closest('.message-image');
        const link = e.target.closest('a[href]');
        if (imgEl && imgEl.dataset.imageUrl) {
            openImageContextMenu(e, msg, imgEl.dataset.imageUrl);
        } else if (link && link.href && !link.href.startsWith('javascript:')) {
            openLinkContextMenu(e, link.href);
        } else {
            openMessageContextMenu(e, msg);
        }
    });

    return wrapper;
}

async function renderMessages(shouldScrollToBottom = true) {
    if (state.renderInProgress) return;
    state.renderInProgress = true;

    const container = document.getElementById("messages");
    if (!state.currentChannel?.name) { container.innerHTML = ''; state.renderInProgress = false; return; }

    const channel = state.currentChannel.name;
    if (!state.messagesByServer[state.serverUrl]?.[channel]) {
        container.innerHTML = "";
        state.renderInProgress = false;
        return;
    }

    const messages = state.messagesByServer[state.serverUrl][channel].slice().sort((a, b) => a.timestamp - b.timestamp);

    if (messages.length === 0) {
        state.renderInProgress = false;
        const channelName = state.currentChannel.display_name || state.currentChannel.name;
        container.innerHTML = `
      <div class="empty-channel-message">
        <div class="empty-channel-icon">💬</div>
        <div class="empty-channel-title">Welcome to #${channelName}</div>
        <div class="empty-channel-text">This is the start of the <strong>#${channelName}</strong> channel.</div>
        <div class="empty-channel-text">Be the first to send a message!</div>
      </div>
    `;
        return;
    }

    const existingMsgIds = new Set();
    container.querySelectorAll('[data-msg-id]').forEach(el => existingMsgIds.add(el.dataset.msgId));

    const existingDaySeparators = new Set();
    container.querySelectorAll('[data-separator-date]').forEach(el => existingDaySeparators.add(el.dataset.separatorDate));

    const isInitialRender = existingMsgIds.size === 0;
    if (isInitialRender) {
        container.innerHTML = '';
    } else {
        container.querySelector('.loading-throbber')?.remove();
    }

    const fragment = document.createDocumentFragment();
    lastUser = null; lastTime = 0; lastGroup = null;
    let consecutiveCount = 0, lastDate = null;

    for (const msg of messages) {
        if (existingMsgIds.has(msg.id)) {
            lastUser = msg.user; lastTime = msg.timestamp;
            lastDate = new Date(msg.timestamp * 1000).toDateString();
            if (msg.user === lastUser && msg.timestamp - lastTime < 300) { consecutiveCount++; } else { consecutiveCount = 0; }
            continue;
        }
        const msgDate = new Date(msg.timestamp * 1000).toDateString();
        if (lastDate !== null && msgDate !== lastDate && !existingDaySeparators.has(msgDate)) {
            fragment.appendChild(getDaySeparator(msg.timestamp));
            consecutiveCount = 0;
        }
        lastDate = msgDate;

        const isSameUserRecent = msg.user === lastUser && msg.timestamp - lastTime < 300 && consecutiveCount < 20;
        if (msg.user === lastUser && msg.timestamp - lastTime < 300) { consecutiveCount++; } else { consecutiveCount = 0; }

        fragment.appendChild(makeMessageElement(msg, isSameUserRecent));
        lastUser = msg.user; lastTime = msg.timestamp;
    }

    if (fragment.childNodes.length > 0) container.appendChild(fragment);

    if (shouldScrollToBottom || isInitialRender) {
        scrollToBottom();
        let observer;
        try {
            observer = new MutationObserver(() => { if (!state._olderLoading) scrollToBottom(); });
            observer.observe(container, { childList: true, subtree: true });
        } catch { }
        container.querySelectorAll('img').forEach(img => {
            if (!img.complete) {
                attachImageScrollHandler(img);
            }
        });
        setTimeout(() => { if (observer) observer.disconnect(); }, 2000);
    }

    setupImageLazyLoading(container);
    updateTypingIndicator();
    state.renderInProgress = false;
}

function appendMessage(msg) {
    if (!state.currentChannel || state.renderInProgress) return;
    const container = document.getElementById("messages");

    container.querySelector('.empty-channel-message')?.remove();

    const messages = state.messagesByServer[state.serverUrl]?.[state.currentChannel.name] || [];
    const prevMsg = messages.length > 1 ? messages[messages.length - 2] : null;
    const isSameUserRecent = prevMsg && msg.user === prevMsg.user && msg.timestamp - prevMsg.timestamp < 300;

    if (prevMsg) {
        const prevDate = new Date(prevMsg.timestamp * 1000).toDateString();
        if (prevDate !== new Date(msg.timestamp * 1000).toDateString()) {
            lastUser = null; lastTime = 0;
            container.appendChild(getDaySeparator(msg.timestamp));
        }
    }

    const element = makeMessageElement(msg, isSameUserRecent);
    container.appendChild(element);
    lastUser = msg.user; lastTime = msg.timestamp;

    if (window.twemoji) {
        const messageText = element.querySelector('.message-text');
        if (messageText) window.twemoji.parse(messageText);
    }

const channelKey = `${state.serverUrl}:${state.currentChannel.name}`;
  const isNearBottom = isElementNearBottom(container, 80);
  if (isNearBottom) {
    state.autoScrollEnabled = true;
  }
  if (state.autoScrollEnabled) {
    scrollToBottom();
  }
  updateScrollButton();
}

function isElementNearBottom(el, threshold = 80) {
    if (!el) return true;
    return (el.scrollHeight - (el.scrollTop + el.clientHeight)) < threshold;
}

function updateMessageContent(msgId, newContent) {
    const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!wrapper) return;
    const msgText = wrapper.querySelector('.message-text');
    if (!msgText) return;
    const msg = state.messagesByServer[state.serverUrl]?.[state.currentChannel.name]?.find(m => m.id === msgId);
    if (!msg) return;

    const embedLinks = [];
    msgText.innerHTML = parseMsg(msg, embedLinks);

    msgText.querySelectorAll('.message-image').forEach(img => {
        if (img.dataset.imageUrl) {
            attachImageErrorFallback(img, img.dataset.imageUrl || img.src);
            img.loading = 'lazy';
        }
    });

    if (embedLinks.length === 1 && isTenorOnlyMessage(embedLinks, msg.content)) {
        msgText.style.display = 'none';
    } else {
        msgText.style.display = '';
        msgText.classList.toggle('emoji-only', isEmojiOnly(msg.content));
    }

    if (window.twemoji) {
        window.twemoji.parse(msgText);
    }

    msgText.querySelectorAll("pre code").forEach(block => {
        try {
            const code = block.textContent;
            block.textContent = code;
            hljs.highlightElement(block);
        } catch (e) {
            console.debug('Highlight error:', e);
        }
    });
    msgText.querySelectorAll("a.potential-image").forEach(link => _processPotentialImageLink(link, wrapper.querySelector('.message-group-content')));

    if (state.currentUser) {
        const matches = msg.content.match(pingRegex);
        if (matches && matches.filter(m => m.trim().toLowerCase() === '@' + state.currentUser.username.toLowerCase()).length > 0) {
            msgText.classList.add('mentioned');
        }
    }
}

function revealBlockedMessage(wrapper, msg) {
    const groupContent = wrapper.querySelector('.message-group-content');
    if (!groupContent) return;
    groupContent.innerHTML = '';

    const user = getUserByUsernameCaseInsensitive(msg.user) || { username: msg.user };
    const isReply = "reply_to" in msg;

    if (isReply) {
        const replyTo = state.messagesByServer[state.serverUrl]?.[state.currentChannel.name]?.find(m => m.id === msg.reply_to.id);
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message-reply';

        if (replyTo) {
            const replyUser = getUserByUsernameCaseInsensitive(replyTo.user) || { username: replyTo.user };
            const replyText = document.createElement('div');
            replyText.className = 'reply-text';
            const usernameSpan = document.createElement('span');
            usernameSpan.className = 'reply-username';
            usernameSpan.textContent = replyUser.username + ': ';
            const contentSpan = document.createElement('span');
            contentSpan.className = 'reply-content';
            contentSpan.textContent = replyTo.content;
            replyText.appendChild(usernameSpan);
            replyText.appendChild(contentSpan);
            replyDiv.appendChild(getAvatar(replyUser.username, 'small'));
            replyDiv.appendChild(replyText);
        } else {
            const notFoundIcon = document.createElement('div');
            notFoundIcon.innerHTML = '<i data-lucide="x-circle"></i>';
            const notFoundText = document.createElement('div');
            notFoundText.className = 'reply-text';
            notFoundText.innerHTML = '<span class="reply-username">Message not found</span>';
            replyDiv.appendChild(notFoundIcon);
            replyDiv.appendChild(notFoundText);
            if (window.lucide) window.lucide.createIcons({ root: notFoundIcon });
        }
        wrapper.insertBefore(replyDiv, wrapper.firstChild);
    }

    const header = document.createElement('div');
    header.className = 'message-header';
    const usernameEl = document.createElement('span');
    usernameEl.className = 'username';
    usernameEl.textContent = msg.user;
    usernameEl.style.color = user.color || '#fff';
    usernameEl.style.cursor = 'pointer';
    usernameEl.addEventListener('click', (e) => { e.stopPropagation(); openAccountModal(msg.user); });
    const ts = document.createElement('span');
    ts.className = 'timestamp';
    ts.textContent = formatTimestamp(msg.timestamp);
    ts.dataset.timestamp = msg.timestamp;
    ts.title = getFullTimestamp(msg.timestamp);
    header.appendChild(usernameEl);
    header.appendChild(ts);
    groupContent.appendChild(header);

    const msgText = document.createElement('div');
    msgText.className = 'message-text';
    const embedLinks = [];
    msgText.innerHTML = parseMsg(msg, embedLinks);
    groupContent.appendChild(msgText);

    msgText.querySelectorAll('.message-image').forEach(img => attachImageErrorFallback(img, img.src || img.dataset.imageUrl));
    msgText.querySelectorAll("pre code").forEach(block => {
        try {
            const code = block.textContent;
            block.textContent = code;
            hljs.highlightElement(block);
        } catch (e) {
            console.debug('Highlight error:', e);
        }
    });
    msgText.querySelectorAll("a.potential-image").forEach(link => _processPotentialImageLink(link, groupContent));

    window.renderReactions(msg, groupContent);
}

async function deleteMessage(msg) {
    if (state.currentChannel?.name === 'notes' && window.notesChannel) {
        await window.notesChannel.deleteMessage(msg.id);
        if (state.messagesByServer[state.serverUrl]?.['notes']) {
            state.messagesByServer[state.serverUrl]['notes'] = state.messagesByServer[state.serverUrl]['notes'].filter(m => m.id !== msg.id);
        }
        renderMessages();
        return;
    }
    wsSend({ cmd: 'message_delete', id: msg.id, channel: state.currentChannel.name }, state.serverUrl);
}
window.deleteMessage = deleteMessage;

function getMessageContextMenuHelpers(event, msg) {
    return {
        copyText: () => { if (msg.content) navigator.clipboard.writeText(msg.content); },
        copyId: () => navigator.clipboard.writeText(msg.id),
        quote: () => {
            const input = document.getElementById('message-input');
            const qt = msg.content ? `> ${msg.content.replace(/\n/g, '\n> ')}` : '> [Attachment]';
            input.value = qt + '\n\n' + input.value;
            input.focus();
            input.selectionStart = input.selectionEnd = 0;
            input.dispatchEvent(new Event('input'));
        },
        react: () => {
            const anchor = document.createElement('div');
            anchor.style.cssText = `position: absolute; left: ${event.clientX}px; top: ${event.clientY}px;`;
            document.body.appendChild(anchor);
            openReactionPicker(msg.id, anchor);
            setTimeout(() => anchor.remove(), 100);
        }
    };
}

function openMessageContextMenu(event, msg) {
    const h = getMessageContextMenuHelpers(event, msg);
    const m = contextMenu(event);
    if (msg.user === state.currentUser?.username) m.item('Edit', () => startEditMessage(msg), 'edit-3');
    m.item('Reply', () => replyToMessage(msg), 'message-circle')
        .item('Copy text', h.copyText, 'copy')
        .item('Copy ID', h.copyId, 'hash')
        .item('Quote', h.quote, 'corner-up-right')
        .item('React', h.react, 'smile')
        .sep()
        .danger('Delete', () => deleteMessage(msg))
        .show();
}

function openLinkContextMenu(event, url) {
    contextMenu(event)
        .item('Copy URL', () => navigator.clipboard.writeText(url), 'copy')
        .item('Open in new tab', () => window.open(url, '_blank', 'noopener,noreferrer'), 'external-link')
        .show();
}

function openImageContextMenu(event, msg, imageUrl) {
    const h = getMessageContextMenuHelpers(event, msg);
    const m = contextMenu(event);
    if (msg.user === state.currentUser?.username) m.item('Edit', () => startEditMessage(msg), 'edit-3');
    m.item('Reply', () => replyToMessage(msg), 'message-circle')
        .item('Copy text', h.copyText, 'copy')
        .item('Copy ID', h.copyId, 'hash')
        .item('Copy image URL', () => navigator.clipboard.writeText(imageUrl), 'image')
        .item('Open image', () => window.open(imageUrl, '_blank', 'noopener,noreferrer'), 'external-link')
        .item('React', h.react, 'smile')
        .sep()
        .danger('Delete', () => deleteMessage(msg))
        .show();
}

function checkPermission(roles, permissions) {
    if (!roles?.length) return true;
    if (!permissions) return false;
    return roles.some(r => permissions.includes(r));
}

function renderMembers(channel) {
    const viewPermissions = channel?.permissions?.view || [];
    const container = document.getElementById('members-list');
    const users = Object.values(state.users).filter(u => checkPermission(u.roles, viewPermissions));

    const isExcludedChannel = state.currentChannel?.name === 'relationships' || state.currentChannel?.name === 'home';
    const isDM = state.serverUrl === 'dms.mistium.com';
    const serverChannelHeader = document.getElementById('server-channel-header');

    if (isDM && isExcludedChannel) {
        container.style.display = 'none';
        if (serverChannelHeader) serverChannelHeader.style.display = 'none';
        return;
    }

    container.innerHTML = '';
    container.style.display = '';
    if (serverChannelHeader && !isDM) serverChannelHeader.style.display = '';

    // Reset MembersContent state when rendering members
    if (window.MembersContent) window.MembersContent.reset();

    // NEW: Check if this is a 1-on-1 DM (exactly 2 users)
    if (isDM && !isExcludedChannel) {
        const filteredUsers = Object.values(state.users).filter(u => checkPermission(u.roles, viewPermissions));
        if (filteredUsers.length === 2) {
            const otherUser = filteredUsers.find(u => u.username !== state.currentUser?.username);
            if (otherUser && window.MembersContent) {
                window.MembersContent.render({ type: 'profile', username: otherUser.username });
                return;
            }
        }
    }

    let headerSec = container.querySelector('.members-header');
    if (!headerSec) {
        headerSec = document.createElement('div');
        headerSec.className = 'members-header';
        headerSec.innerHTML = `<h3>Members</h3><span class="close-members" onclick="toggleMembersList()"><i data-lucide="x"></i></span>`;
        container.insertBefore(headerSec, container.firstChild);
    }

    let ownerSec = container.querySelector('.section-owner');
    let onlineSec = container.querySelector('.section-online');
    let offlineSec = container.querySelector('.section-offline');

    const owners = users.filter(u => u.roles?.includes('owner')).sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
    const nonOwners = users.filter(u => !u.roles?.includes('owner'));
    const online = nonOwners.filter(u => u.status === 'online').sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
    const offline = nonOwners.filter(u => u.status !== 'online').sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));

    if (isDM && ownerSec) { ownerSec.remove(); ownerSec = null; }

    if (!isDM && owners.length > 0 && !ownerSec) {
        ownerSec = document.createElement('div');
        ownerSec.className = 'section section-owner';
        const h = document.createElement('h2');
        h.textContent = 'Owner';
        ownerSec.appendChild(h);
        container.insertBefore(ownerSec, container.firstChild);
    }
    if (!onlineSec) {
        onlineSec = document.createElement('div');
        onlineSec.className = 'section section-online';
        const h = document.createElement('h2');
        h.textContent = 'Online';
        onlineSec.appendChild(h);
        container.appendChild(onlineSec);
    }
    if (!offlineSec) {
        offlineSec = document.createElement('div');
        offlineSec.className = 'section section-offline';
        const h = document.createElement('h2');
        h.textContent = 'Offline';
        offlineSec.appendChild(h);
        container.appendChild(offlineSec);
    }

    if (!isDM && ownerSec) updateSection(ownerSec, owners);
    updateSection(onlineSec, online);
    updateSection(offlineSec, offline);

    if (headerSec) container.appendChild(headerSec);
    if (!isDM && ownerSec) container.appendChild(ownerSec);
    container.appendChild(onlineSec);
    container.appendChild(offlineSec);
    if (window.lucide) window.lucide.createIcons();

    function updateSection(section, users) {
        const membersMap = new Map([...section.querySelectorAll('.member')].map(el => [el.dataset.username, el]));
        for (const u of users) {
            let el = membersMap.get(u.username);
            if (!el) {
                el = document.createElement('div');
                el.className = 'member';
                el.dataset.username = u.username;
                el.style.cursor = 'pointer';
                el.addEventListener('click', () => openAccountModal(u.username));
                el.appendChild(getAvatar(u.username));
                const name = document.createElement('span');
                name.className = 'name';
                el.appendChild(name);
                section.appendChild(el);
            }
            const name = el.querySelector('.name');
            name.textContent = u.username;
            name.style.color = u.color || '#fff';
            el.classList.toggle('offline', u.status !== 'online');
            membersMap.delete(u.username);
        }
        membersMap.forEach(el => el.remove());
    }
}

function replaceShortcodesWithEmojis(text) {
    if (!window.shortcodeMap) return text;
    return text.replace(/:\w+:/g, (match) => window.shortcodeMap[match] || match);
}

async function sendMessage() {
    closeMentionPopup();
    const input = document.getElementById('message-input');
    let content = replaceShortcodesWithEmojis(input.value.trim());
    if (!content || !state.currentChannel) return;

    if (window.editingMessage) {
        const msgId = window.editingMessage.id;
        wsSend({ cmd: 'message_edit', id: msgId, channel: state.currentChannel.name, content }, state.serverUrl);
        const msg = state.messagesByServer[state.serverUrl]?.[state.currentChannel.name]?.find(m => m.id === msgId);
        if (msg) {
            msg.edited = true; msg.editedAt = Date.now(); msg.content = content;
            const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
            if (wrapper) {
                const header = wrapper.querySelector('.message-header');
                if (header && !header.querySelector('.edited-indicator')) {
                    const editedIndicator = document.createElement('span');
                    editedIndicator.className = 'edited-indicator';
                    editedIndicator.textContent = '(edited)';
                    header.appendChild(editedIndicator);
                }
            }
        }
        window.editingMessage = null;
        originalInputValue = '';
        document.getElementById('reply-bar').classList.remove('active', 'editing-mode');
        input.value = '';
        input.style.height = 'auto';
        return;
    }

    const msg = { cmd: 'message_new', channel: state.currentChannel.name, content };
    if (state.replyTo) { msg.reply_to = state.replyTo.id; cancelReply(); }

    if (state.serverUrl === 'dms.mistium.com' && state.currentChannel?.name === 'notes' && window.notesChannel) {
        const savedMsg = await window.notesChannel.saveMessage(content, state.currentUser?.username ?? "originChats");
        if (savedMsg) { state.messagesByServer[state.serverUrl][state.currentChannel.name].push(savedMsg); appendMessage(savedMsg); }
    } else {
        wsSend(msg, state.serverUrl);
    }
    input.value = '';
    input.style.height = 'auto';
}

let typing = false;
let lastTyped = 0;

function setupTypingListener() {
    document.getElementById("message-input").addEventListener("input", () => {
        lastTyped = Date.now();
        if (!typing) { typing = true; sendTyping(); watchForStopTyping(); }
    });
}

function watchForStopTyping() {
    const interval = setInterval(() => {
        if (Date.now() - lastTyped > 1200) { typing = false; clearInterval(interval); }
    }, 300);
}

function setupInfiniteScroll() {
  const container = document.getElementById('messages');
  if (!container) return;
  container.addEventListener('scroll', (e) => {
    if (!state.currentChannel) return;
    const channelKey = `${state.serverUrl}:${state.currentChannel.name}`;
    const scrollEl = container.querySelector('.virtual-scroll-viewport') || container;

    state.scrollPositionsByChannel[channelKey] = scrollEl.scrollTop;

    const isNearBottom = isElementNearBottom(scrollEl, 80);
    state.autoScrollEnabled = isNearBottom;
    updateScrollButton();

    if (state._olderLoading) return;
    if (state.pendingMessageFetchesByChannel[channelKey]) return;
    if (scrollEl.scrollTop <= 10) {
      const ch = state.currentChannel.name;
      const messages = state.messagesByServer[state.serverUrl]?.[ch] || [];
      const start = messages.length || 0;
      const lastSent = state._olderCooldown[ch] || 0;
      if (Date.now() - lastSent < 750) return;
      state._olderLoading = true;
      state._loadingOlder[ch] = { start, limit: 20 };
      state._olderCooldown[ch] = Date.now();
      wsSend({ cmd: 'messages_get', channel: ch, start, limit: 20 }, state.serverUrl);
    }
  });
}

function sendTyping() {
    if (state.serverUrl === 'dms.mistium.com' && state.currentChannel.name === 'notes') return;
    wsSend({ cmd: 'typing', channel: state.currentChannel.name }, state.serverUrl);
}

function replyToMessage(msg) {
    state.replyTo = msg;
    const replyBar = document.getElementById('reply-bar');
    const icon = document.getElementById('reply-bar-icon');
    const label = document.getElementById('reply-bar-label');
    const text = document.getElementById('reply-text');
    const preview = document.getElementById('reply-preview');

    icon.setAttribute('data-lucide', 'corner-up-left');
    label.textContent = 'Replying to';
    text.innerHTML = `<span class="username">${escapeHtml(msg.user)}</span>`;

    if (msg.content && msg.content.trim()) {
        const cleanContent = msg.content.replace(/```[\s\S]*?```/g, '[code]').replace(/`[^`]*`/g, '[code]');
        preview.textContent = cleanContent.length > 100 ? cleanContent.substring(0, 100) + '...' : cleanContent;
        preview.style.display = 'block';
    } else if (msg.attachments && msg.attachments.length > 0) {
        preview.textContent = msg.attachments.length === 1 ? '[Attachment]' : `[${msg.attachments.length} Attachments]`;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }

    replyBar.classList.add('active');
    replyBar.classList.remove('editing-mode');
    if (window.lucide) window.lucide.createIcons({ root: replyBar });
    document.getElementById('message-input')?.focus();
}

function cancelReply() {
    state.replyTo = null;
    document.getElementById('reply-preview').style.display = 'none';
    document.getElementById('reply-bar').classList.remove('active', 'editing-mode');
}

function updateUserSection() {
    if (!state.currentUser) return;
    const sidebarAvatar = document.getElementById('user-avatar-sidebar');
    if (sidebarAvatar) {
        const profileIcon = sidebarAvatar.querySelector('.user-profile-icon');
        if (profileIcon) profileIcon.innerHTML = `<img src="https://avatars.rotur.dev/${state.currentUser.username}?radius=128" alt="${state.currentUser.username}">`;
    }
}

let mentionState = { active: false, query: '', startIndex: 0, selectedIndex: 0, filteredUsers: [] };
let emojiState = { active: false, query: '', startIndex: 0, selectedIndex: 0, filteredEmojis: [] };

function handleMentionInput() {
    const input = document.getElementById('message-input');
    const cursorPos = input.selectionStart;
    const words = input.value.substring(0, cursorPos).split(/\s/);
    const lastWord = words[words.length - 1] || '';

    if (lastWord.startsWith('@')) {
        closeChannelPopup(); closeEmojiPopup();
        mentionState.active = true;
        mentionState.query = lastWord.substring(1).toLowerCase();
        mentionState.startIndex = cursorPos - lastWord.length;
        mentionState.selectedIndex = 0;
        filterUsers(mentionState.query);
    } else if (lastWord.startsWith('#')) {
        closeMentionPopup(); closeEmojiPopup();
    } else if (lastWord.startsWith(':') && window.shortcodeMap) {
        closeMentionPopup(); closeChannelPopup();
        const emojiQuery = lastWord.substring(1).toLowerCase();
        if (emojiQuery.length > 2) {
            emojiState.active = true;
            emojiState.query = emojiQuery;
            emojiState.startIndex = cursorPos - lastWord.length;
            emojiState.selectedIndex = 0;
            filterEmojis(emojiState.query);
        } else {
            closeEmojiPopup();
        }
    } else {
        closeMentionPopup(); closeEmojiPopup();
    }
}

function filterEmojis(query) {
    if (!window.shortcodes || !window.shortcodeMap) { closeEmojiPopup(); return; }
    const emojiEntries = Object.entries(window.shortcodeMap);
    if (query === '') {
        emojiState.filteredEmojis = emojiEntries.map(([shortcode, emoji]) => ({ shortcode, emoji })).slice(0, 20);
    } else {
        emojiState.filteredEmojis = emojiEntries
            .filter(([shortcode]) => shortcode.replace(/^:/, '').replace(/:$/, '').toLowerCase().includes(query))
            .map(([shortcode, emoji]) => ({ shortcode, emoji }))
            .sort((a, b) => {
                const aStarts = a.shortcode.replace(/^:/, '').replace(/:$/, '').toLowerCase().startsWith(query) ? 0 : 1;
                const bStarts = b.shortcode.replace(/^:/, '').replace(/:$/, '').toLowerCase().startsWith(query) ? 0 : 1;
                return aStarts !== bStarts ? aStarts - bStarts : a.shortcode.localeCompare(b.shortcode);
            })
            .slice(0, 20);
    }
    renderEmojiPopup();
}

function filterUsers(query) {
    const users = Object.values(state.users);
    if (query === '') {
        mentionState.filteredUsers = users.sort((a, b) => {
            const aOnline = a.status === 'online' ? 0 : 1;
            const bOnline = b.status === 'online' ? 0 : 1;
            return aOnline !== bOnline ? aOnline - bOnline : a.username.localeCompare(b.username);
        });
    } else {
        mentionState.filteredUsers = users
            .filter(user => user.username.toLowerCase().includes(query))
            .sort((a, b) => {
                const aExact = a.username.toLowerCase() === query ? 0 : 1;
                const bExact = b.username.toLowerCase() === query ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                const aOnline = a.status === 'online' ? 0 : 1;
                const bOnline = b.status === 'online' ? 0 : 1;
                return aOnline !== bOnline ? aOnline - bOnline : a.username.localeCompare(b.username);
            });
    }
    renderMentionPopup();
}

function renderMentionPopup() {
    const popup = document.getElementById('mention-popup');
    const list = document.getElementById('mention-list');
    if (mentionState.filteredUsers.length === 0) { closeMentionPopup(); return; }
    list.innerHTML = '';
    mentionState.filteredUsers.slice(0, 8).forEach((user, index) => {
        const li = document.createElement('li');
        li.className = 'mention-item' + (index === mentionState.selectedIndex ? ' selected' : '');
        li.dataset.username = user.username;
        li.dataset.index = index;
        li.innerHTML = `
            <img src="${getAvatarSrc(user.username)}" alt="${user.username}">
            <div class="mention-info">
                <div class="mention-name">${escapeHtml(user.username)}</div>
                <div class="mention-status">${user.status === 'online' ? 'Online' : 'Offline'}</div>
            </div>
        `;
        li.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); selectMention(index); });
        li.addEventListener('mouseenter', () => { mentionState.selectedIndex = index; updateMentionSelection(); });
        if (user.status === 'online') li.classList.add('online');
        list.appendChild(li);
    });
    popup.classList.add('active');
}

function getAvatarSrc(username) {
    return state._avatarCache[username] || proxyImageUrl(`https://avatars.rotur.dev/${username}`);
}

function handleMentionNavigation(e) {
    if (emojiState.active) {
        if (e.key === 'Escape') { closeEmojiPopup(); return true; }
        if (e.key === 'ArrowDown') { e.preventDefault(); emojiState.selectedIndex = Math.min(emojiState.selectedIndex + 1, emojiState.filteredEmojis.length - 1); updateEmojiSelection(); return true; }
        if (e.key === 'ArrowUp') { e.preventDefault(); emojiState.selectedIndex = Math.max(emojiState.selectedIndex - 1, 0); updateEmojiSelection(); return true; }
        if ((e.key === 'Tab' || e.key === 'Enter') && emojiState.filteredEmojis.length > 0) { e.preventDefault(); selectEmoji(emojiState.selectedIndex); return true; }
    } else if (mentionState.active) {
        if (e.key === 'Escape') { closeMentionPopup(); return true; }
        if (e.key === 'ArrowDown') { e.preventDefault(); mentionState.selectedIndex = Math.min(mentionState.selectedIndex + 1, mentionState.filteredUsers.length - 1); updateMentionSelection(); return true; }
        if (e.key === 'ArrowUp') { e.preventDefault(); mentionState.selectedIndex = Math.max(mentionState.selectedIndex - 1, 0); updateMentionSelection(); return true; }
        if ((e.key === 'Tab' || e.key === 'Enter') && mentionState.filteredUsers.length > 0) { e.preventDefault(); selectMention(mentionState.selectedIndex); return true; }
    }
    return false;
}

function _scrollPopupToSelected(popup, items, selectedIndex) {
    const selected = items[selectedIndex];
    if (!selected) return;
    const popupRect = popup.getBoundingClientRect();
    const itemRect = selected.getBoundingClientRect();
    if (itemRect.bottom > popupRect.bottom) popup.scrollTop += itemRect.bottom - popupRect.bottom + 10;
    else if (itemRect.top < popupRect.top) popup.scrollTop += itemRect.top - popupRect.top - 10;
}

function updateMentionSelection() {
    const items = document.querySelectorAll('.mention-item');
    items.forEach((item, index) => item.classList.toggle('selected', index === mentionState.selectedIndex));
    _scrollPopupToSelected(document.getElementById('mention-popup'), items, mentionState.selectedIndex);
}

function selectMention(index) {
    const username = mentionState.filteredUsers[index].username;
    const input = document.getElementById('message-input');
    const mention = `@${username} `;
    const before = input.value.substring(0, mentionState.startIndex);
    const after = input.value.substring(input.selectionStart);
    input.value = before + mention + after;
    const newPos = mentionState.startIndex + mention.length;
    input.setSelectionRange(newPos, newPos);
    closeMentionPopup();
    input.focus();
}

function closeMentionPopup() {
    mentionState.active = false; mentionState.query = ''; mentionState.startIndex = 0; mentionState.selectedIndex = 0; mentionState.filteredUsers = [];
    const popup = document.getElementById('mention-popup');
    const list = document.getElementById('mention-list');
    if (list?.querySelector('.mention-item')) { popup.classList.remove('active'); list.innerHTML = ''; }
}

function closeEmojiPopup() {
    emojiState.active = false; emojiState.query = ''; emojiState.startIndex = 0; emojiState.selectedIndex = 0; emojiState.filteredEmojis = [];
    const popup = document.getElementById('emoji-popup');
    const list = document.getElementById('emoji-list');
    if (popup && list) { popup.classList.remove('active'); list.innerHTML = ''; }
}

function renderEmojiPopup() {
    const popup = document.getElementById('emoji-popup');
    const list = document.getElementById('emoji-list');
    if (!popup || !list) { console.error('Emoji popup or list not found in DOM'); return; }
    if (emojiState.filteredEmojis.length === 0) { closeEmojiPopup(); return; }
    list.innerHTML = '';
    emojiState.filteredEmojis.slice(0, 8).forEach(({ shortcode, emoji }, index) => {
        const li = document.createElement('li');
        li.className = 'emoji-item' + (index === emojiState.selectedIndex ? ' selected' : '');
        li.dataset.shortcode = shortcode;
        li.dataset.index = index;
        const previewSpan = document.createElement('span');
        previewSpan.className = 'emoji-preview';
        previewSpan.textContent = emoji;
        if (window.twemoji) {
            window.twemoji.parse(previewSpan);
        }
        li.appendChild(previewSpan);
        const infoDiv = document.createElement('div');
        infoDiv.className = 'emoji-info';
        const shortcodeDiv = document.createElement('div');
        shortcodeDiv.className = 'emoji-shortcode';
        shortcodeDiv.textContent = shortcode;
        infoDiv.appendChild(shortcodeDiv);
        li.appendChild(infoDiv);
        li.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); selectEmoji(index); });
        li.addEventListener('mouseenter', () => { emojiState.selectedIndex = index; updateEmojiSelection(); });
        list.appendChild(li);
    });
    popup.classList.add('active');
}

function selectEmoji(emojiOrIndex) {
    if (typeof emojiOrIndex === 'number') {
        const input = document.getElementById('message-input');
        const { emoji } = emojiState.filteredEmojis[emojiOrIndex];
        const before = input.value.substring(0, emojiState.startIndex);
        const after = input.value.substring(emojiState.startIndex + 1 + emojiState.query.length);
        input.value = before + emoji + ' ' + after;
        const newPos = emojiState.startIndex + emoji.length + 1;
        input.setSelectionRange(newPos, newPos);
        closeEmojiPopup();
        input.focus();
        return;
    }

    const emoji = emojiOrIndex;
    window.recentEmojis = [emoji, ...window.recentEmojis.filter(e => e !== emoji)].slice(0, 50);

    const msgId = window.reactionPickerMsgId;
    const unifiedPicker = document.getElementById('unified-picker');

    const closePickers = () => {
        const reactionPicker = document.getElementById('reaction-picker');
        if (reactionPicker) reactionPicker.classList.remove('active');
        if (unifiedPicker) unifiedPicker.classList.remove('active');
        const overlay = document.querySelector('.unified-picker-overlay') || document.querySelector('.reaction-picker-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => { if (!unifiedPicker?.classList.contains('active')) overlay.style.display = 'none'; }, 200);
        }
    };

    if (msgId) {
        closePickers();
        window.addReaction(msgId, emoji);
    } else {
        const input = document.getElementById('message-input');
        if (!input) { console.error('Message input not found'); return; }
        try {
            input.focus();
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
            const pos = start + emoji.length;
            input.selectionStart = pos; input.selectionEnd = pos;
            setTimeout(() => { input.focus(); closePickers(); }, 10);
        } catch (e) { console.error('Error inserting emoji:', e); }
    }
}

function updateEmojiSelection() {
    const items = document.querySelectorAll('.emoji-item');
    items.forEach((item, index) => item.classList.toggle('selected', index === emojiState.selectedIndex));
    _scrollPopupToSelected(document.getElementById('emoji-popup'), items, emojiState.selectedIndex);
}

let channelState = { active: false, query: '', startIndex: 0, selectedIndex: 0, filteredChannels: [] };

function handleChannelInput() {
    const input = document.getElementById('message-input');
    const cursorPos = input.selectionStart;
    const words = input.value.substring(0, cursorPos).split(/\s/);
    const lastWord = words[words.length - 1] || '';
    if (lastWord.startsWith('#')) {
        closeMentionPopup();
        channelState.active = true;
        channelState.query = lastWord.substring(1).toLowerCase();
        channelState.startIndex = cursorPos - lastWord.length;
        channelState.selectedIndex = 0;
        filterChannels(channelState.query);
    } else {
        closeChannelPopup();
    }
}

function filterChannels(query) {
    const channels = state.channels.filter(c => c.type === 'text');
    channelState.filteredChannels = query === ''
        ? channels.sort((a, b) => a.name.localeCompare(b.name))
        : channels.filter(c => getChannelDisplayName(c).toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
    renderChannelPopup();
}

function renderChannelPopup() {
    const popup = document.getElementById('mention-popup');
    const list = document.getElementById('mention-list');
    if (channelState.filteredChannels.length === 0) { closeChannelPopup(); return; }
    list.innerHTML = '';
    channelState.filteredChannels.slice(0, 8).forEach((channel, index) => {
        const li = document.createElement('li');
        li.className = 'channel-mention-item' + (index === channelState.selectedIndex ? ' selected' : '');
        li.dataset.channelName = channel.name;
        li.dataset.index = index;
        li.innerHTML = `<span class="channel-mention-hash">#</span><div class="channel-mention-info"><div class="channel-mention-name">${escapeHtml(getChannelDisplayName(channel))}</div></div>`;
        li.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); selectChannelMention(index); });
        li.addEventListener('mouseenter', () => { channelState.selectedIndex = index; updateChannelSelection(); });
        list.appendChild(li);
    });
    popup.classList.add('active');
}

function handleChannelNavigation(e) {
    if (!channelState.active) return false;
    if (e.key === 'Escape') { closeChannelPopup(); return true; }
    if (e.key === 'ArrowDown') { e.preventDefault(); channelState.selectedIndex = Math.min(channelState.selectedIndex + 1, channelState.filteredChannels.length - 1); updateChannelSelection(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); channelState.selectedIndex = Math.max(channelState.selectedIndex - 1, 0); updateChannelSelection(); return true; }
    if ((e.key === 'Tab' || e.key === 'Enter') && channelState.filteredChannels.length > 0) { e.preventDefault(); selectChannelMention(channelState.selectedIndex); return true; }
    return false;
}

function updateChannelSelection() {
    const items = document.querySelectorAll('.channel-mention-item');
    items.forEach((item, index) => item.classList.toggle('selected', index === channelState.selectedIndex));
    _scrollPopupToSelected(document.getElementById('mention-popup'), items, channelState.selectedIndex);
}

function selectChannelMention(index) {
    const channel = channelState.filteredChannels[index];
    const displayName = getChannelDisplayName(channel);
    const input = document.getElementById('message-input');
    const mention = `#${displayName}`;
    const before = input.value.substring(0, channelState.startIndex);
    const after = input.value.substring(input.selectionStart);
    input.value = before + mention + after;
    const newPos = channelState.startIndex + mention.length;
    input.setSelectionRange(newPos, newPos);
    closeChannelPopup();
    input.focus();
}

function closeChannelPopup() {
    channelState.active = false; channelState.query = ''; channelState.startIndex = 0; channelState.selectedIndex = 0; channelState.filteredChannels = [];
    const popup = document.getElementById('mention-popup');
    const list = document.getElementById('mention-list');
    if (list?.querySelector('.channel-mention-item')) { popup.classList.remove('active'); list.innerHTML = ''; }
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href && !link.dataset.imageUrl) { link.target = '_blank'; link.rel = 'noopener noreferrer'; return; }
    if (!e.target.closest('.input-wrapper')) { closeMentionPopup(); closeChannelPopup(); }

    const channelMention = e.target.closest('.channel-mention');
    if (channelMention) {
        const channel = state.channels.find(c => c.name === channelMention.dataset.channel);
        if (channel) { selectChannel(channel); e.preventDefault(); e.stopPropagation(); }
    }

    const mention = e.target.closest('.mention');
    if (mention && mention.dataset.user) { openAccountModal(mention.dataset.user); e.preventDefault(); e.stopPropagation(); }
});

function toggleUserMenu() {
    document.getElementById('user-menu').classList.toggle('active');
}

async function attemptLogout() {
    if (confirm('Are you sure you want to log out?')) logout();
}

function logout() {
    localStorage.removeItem('originchats_token');
    Object.keys(wsConnections).forEach(key => closeWebSocket(key));
    state.token = null;
    state.currentUser = null;
    window.location.reload();
}

let errorBannerTimer = null;

function showError(message) {
    const banner = document.getElementById('error-banner');
    const text = document.getElementById('error-text');
    if (banner && text) {
        text.textContent = message;
        banner.classList.add('active');
        if (window.lucide) window.lucide.createIcons();
        if (errorBannerTimer) clearTimeout(errorBannerTimer);
        errorBannerTimer = setTimeout(() => { hideErrorBanner(); errorBannerTimer = null; }, 5000);
    }
}

function hideErrorBanner() {
    document.getElementById('error-banner')?.classList.remove('active');
    if (errorBannerTimer) { clearTimeout(errorBannerTimer); errorBannerTimer = null; }
}

let rateLimitTimer = null;

function showRateLimit(duration) {
    const inputWrapper = document.querySelector('.input-wrapper');
    const indicator = document.getElementById('rate-limit-indicator');
    const rateLimitText = document.getElementById('rate-limit-text');
    const input = document.getElementById('message-input');

    let messageEl = inputWrapper.querySelector('.rate-limit-message');
    if (!messageEl) {
        messageEl = document.createElement('div');
        messageEl.className = 'rate-limit-message';
        messageEl.innerHTML = '<i data-lucide="alert-triangle"></i><span id="rate-limit-message-text"></span>';
        inputWrapper.appendChild(messageEl);
        if (window.lucide) window.lucide.createIcons({ root: messageEl });
    }

    inputWrapper.classList.add('rate-limited');
    indicator.classList.add('active');

    let remaining = duration;
    const updateText = (secs) => {
        const t = `Rate limited for ${secs}s`;
        rateLimitText.textContent = t;
        const mt = document.getElementById('rate-limit-message-text');
        if (mt) mt.textContent = t;
    };
    updateText(Math.ceil(duration / 1000));

    if (rateLimitTimer) clearInterval(rateLimitTimer);
    rateLimitTimer = setInterval(() => {
        remaining -= 1000;
        const secs = Math.ceil(remaining / 1000);
        if (secs <= 0) {
            clearInterval(rateLimitTimer);
            rateLimitTimer = null;
            inputWrapper.classList.remove('rate-limited');
            indicator.classList.remove('active');
            inputWrapper.querySelector('.rate-limit-message')?.remove();
            input.focus();
        } else {
            updateText(secs);
        }
    }, 1000);
}

function clearRateLimit() {
    if (rateLimitTimer) { clearInterval(rateLimitTimer); rateLimitTimer = null; }
    const inputWrapper = document.querySelector('.input-wrapper');
    if (inputWrapper) { inputWrapper.classList.remove('rate-limited'); inputWrapper.querySelector('.rate-limit-message')?.remove(); }
    document.getElementById('rate-limit-indicator')?.classList.remove('active');
}

function addDMServer(username, channel) {
    const existingIndex = state.dmServers.findIndex(dm => dm.channel === channel);
    if (existingIndex >= 0) {
        const dm = state.dmServers.splice(existingIndex, 1)[0];
        state.dmServers.unshift(dm);
        return;
    }
    state.dmServers.unshift({ username, channel, name: username });
    if (state.dmServers.length > 10) state.dmServers = state.dmServers.slice(0, 10);
    localStorage.setItem('originchats_dm_servers', JSON.stringify(state.dmServers));
    renderGuildSidebar();
}

function renderMediaServersSettings() {
    const serversList = document.getElementById('media-servers-list');
    serversList.innerHTML = '';
    const servers = window.mediaServers || [];

    if (servers.length === 0) {
        serversList.innerHTML = `<div class="server-list-none"><i data-lucide="server"></i><div>No media servers configured</div></div>`;
    } else {
        servers.forEach(server => {
            const item = document.createElement('div');
            item.className = 'server-list-item';
            item.innerHTML = `
                <div class="server-list-info">
                    <div class="server-list-name">
                        ${server.name}
                        ${server.id === 'roturphotos' ? '<span style="font-size: 11px; background: rgba(88, 101, 242, 0.2); color: #5865f2; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Default</span>' : ''}
                    </div>
                    <div class="server-list-url">${server.uploadUrl}</div>
                </div>
                <div class="server-list-actions">
                    <div class="server-list-toggle">
                        <div class="toggle-switch ${server.enabled ? 'active' : ''}" onclick="toggleServerEnabled('${server.id}')"></div>
                    </div>
                    <button class="btn btn-secondary btn-small" onclick="editServer('${server.id}')"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
                    ${server.id !== 'roturphotos' ? `<button class="btn btn-danger btn-small" onclick="deleteServer('${server.id}')"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>` : ''}
                </div>
            `;
            serversList.appendChild(item);
        });
    }
    if (window.lucide) window.lucide.createIcons({ root: serversList });
}

function toggleServerEnabled(id) {
    const server = window.getMediaServerById(id);
    if (server) { window.setMediaServerEnabled(id, !server.enabled); renderMediaServersSettings(); }
}

function deleteServer(id) {
    if (confirm('Are you sure you want to delete this media server?')) { window.deleteMediaServer(id); renderMediaServersSettings(); }
}

let editingServerId = null;

function openAddServerModal() {
    editingServerId = null;
    document.getElementById('server-modal-title').textContent = 'Add Media Server';
    document.getElementById('server-config-form').reset();
    document.getElementById('headers-list').innerHTML = '';
    document.getElementById('body-params-list').innerHTML = '';
    const serverTypeSelect = document.querySelector('[name="serverType"]');
    if (serverTypeSelect) serverTypeSelect.value = 'rotur';
    updateServerTypeOptions();
    updateAuthOptions();
    const modal = document.getElementById('server-config-modal');
    modal.style.display = 'flex';
    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
}

function editServer(id) {
    const server = window.getMediaServerById(id);
    if (!server) return;
    editingServerId = id;
    document.getElementById('server-modal-title').textContent = 'Edit Media Server';
    const form = document.getElementById('server-config-form');
    const isRoturServer = server.id === 'roturphotos' || (server.uploadUrl?.includes('/api/image/upload') && server.responseUrlPath === '$.path' && server.authType === 'session');
    const serverTypeSelect = form.querySelector('[name="serverType"]');
    if (serverTypeSelect) serverTypeSelect.value = isRoturServer ? 'rotur' : 'custom';

    if (isRoturServer) {
        const baseUrl = server.urlTemplate ? server.urlTemplate.replace('/{id}', '') : 'https://photos.rotur.dev';
        form.roturUrl.value = baseUrl;
        form.roturName.value = server.name || 'roturPhotos';
    } else {
        form.name.value = server.name || '';
        form.uploadUrl.value = server.uploadUrl || '';
        form.method.value = server.method || 'POST';
        form.enabled.value = server.enabled ? 'true' : 'false';
        form.fileParamName.value = server.fileParamName || '';
        form.responseUrlPath.value = server.responseUrlPath || '';
        form.urlTemplate.value = server.urlTemplate || '';
        form.requiresAuth.value = server.requiresAuth ? 'true' : 'false';
        form.authType.value = server.authType || 'session';
        form.authParam.value = server.apiKey || '';
        document.getElementById('headers-list').innerHTML = '';
        if (server.headers) server.headers.forEach(h => addHeaderRow(h.key, h.value));
        document.getElementById('body-params-list').innerHTML = '';
        if (server.bodyParams) server.bodyParams.forEach(p => addBodyParamRow(p.key, p.value));
    }

    updateServerTypeOptions();
    updateAuthOptions();
    const modal = document.getElementById('server-config-modal');
    modal.style.display = 'flex';
    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
}

function updateAuthOptions() {
    const requiresAuth = document.querySelector('[name="requiresAuth"]')?.value === 'true';
    const authType = document.querySelector('[name="authType"]')?.value;
    const authOptions = document.getElementById('auth-options');
    const authParamGroup = document.getElementById('auth-param-group');
    const authParamLabel = document.getElementById('auth-param-label');
    if (!authOptions) return;
    authOptions.style.display = requiresAuth ? 'block' : 'none';
    if (requiresAuth && authType !== 'session') {
        authParamGroup.style.display = 'flex';
        authParamLabel.textContent = authType === 'token' ? 'Bearer Token' : 'API Key';
    } else if (authParamGroup) {
        authParamGroup.style.display = 'none';
    }
}

function updateServerTypeOptions() {
    const serverType = document.querySelector('[name="serverType"]')?.value;
    const roturFields = document.getElementById('rotur-server-fields');
    const customFields = document.getElementById('custom-server-fields');
    if (serverType === 'rotur') { roturFields.style.display = 'block'; customFields.style.display = 'none'; }
    else { roturFields.style.display = 'none'; customFields.style.display = 'block'; }
}

function cleanRoturUrl(url) {
    if (!url) return 'https://photos.rotur.dev';
    url = url.replace(/\/$/, '').replace(/^https?:\/\//, '').split('/')[0];
    return `https://${url}`;
}

function createRoturConfig(url, name) {
    const baseUrl = cleanRoturUrl(url);
    return {
        id: 'rotur_' + Date.now(),
        name: name || 'roturPhotos',
        uploadUrl: `${baseUrl}/api/image/upload`,
        method: 'POST',
        fileParamName: null,
        headers: [],
        bodyParams: [],
        responseUrlPath: '$.path',
        urlTemplate: `${baseUrl}/{id}`,
        requiresAuth: true,
        authType: 'session',
        enabled: true
    };
}

function _buildParamRow(containerId, keyClass, valueClass, keyPlaceholder, valuePlaceholder, keyVal = '', valueVal = '') {
    const container = document.getElementById(containerId);
    const row = document.createElement('div');
    row.className = 'param-row';
    row.innerHTML = `
        <input type="text" class="setting-input ${keyClass}" placeholder="${keyPlaceholder}" value="${keyVal}">
        <input type="text" class="setting-input ${valueClass}" placeholder="${valuePlaceholder}" value="${valueVal}">
        <button type="button" class="btn btn-danger btn-small" onclick="this.parentElement.remove()">
            <i data-lucide="x" style="width: 14px; height: 14px;"></i>
        </button>
    `;
    container.appendChild(row);
    if (window.lucide) window.lucide.createIcons({ root: row });
}

function addHeaderRow(key = '', value = '') {
    _buildParamRow('headers-list', 'header-key', 'header-value', 'Header name', 'Header value', key, value);
}

function addBodyParamRow(key = '', value = '') {
    _buildParamRow('body-params-list', 'param-key', 'param-value', 'Parameter name', 'Parameter value', key, value);
}

document.addEventListener('DOMContentLoaded', function () {
    const serverForm = document.getElementById('server-config-form');
    if (serverForm) {
        serverForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const formData = new FormData(serverForm);
            const serverType = formData.get('serverType');
            let config;

            if (serverType === 'rotur') {
                config = createRoturConfig(formData.get('roturUrl'), formData.get('roturName'));
            } else {
                const headers = [];
                document.querySelectorAll('#headers-list .param-row').forEach(row => {
                    const key = row.querySelector('.header-key').value.trim();
                    const value = row.querySelector('.header-value').value.trim();
                    if (key && value) headers.push({ key, value });
                });
                const bodyParams = [];
                document.querySelectorAll('#body-params-list .param-row').forEach(row => {
                    const key = row.querySelector('.param-key').value.trim();
                    const value = row.querySelector('.param-value').value.trim();
                    if (key && value) bodyParams.push({ key, value });
                });
                config = {
                    id: editingServerId || window.generateServerId(),
                    name: formData.get('name'),
                    uploadUrl: formData.get('uploadUrl'),
                    method: formData.get('method'),
                    enabled: formData.get('enabled') === 'true',
                    fileParamName: formData.get('fileParamName') || null,
                    responseUrlPath: formData.get('responseUrlPath') || null,
                    urlTemplate: formData.get('urlTemplate') || null,
                    requiresAuth: formData.get('requiresAuth') === 'true',
                    authType: formData.get('authType'),
                    headers,
                    bodyParams
                };
                if (formData.get('authParam')) config.apiKey = formData.get('authParam');
            }
            window.addMediaServer(config);
            closeServerConfigModal();
            renderMediaServersSettings();
        });
    }

    const authTypeSelect = document.querySelector('[name="authType"]');
    const requiresAuthSelect = document.querySelector('[name="requiresAuth"]');
    if (authTypeSelect) authTypeSelect.addEventListener('change', updateAuthOptions);
    if (requiresAuthSelect) requiresAuthSelect.addEventListener('change', updateAuthOptions);

    const uploadInput = document.getElementById('image-upload-input');
    if (uploadInput) {
        uploadInput.addEventListener('change', function (e) {
            if (e.target.files.length > 0) handleFileUpload(e.target.files);
            this.value = '';
        });
    }

    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) { messagesContainer.addEventListener('dragover', handleDragOver); messagesContainer.addEventListener('drop', handleDrop); }
    const inputArea = document.querySelector('.input-area');
    if (inputArea) { inputArea.addEventListener('dragover', handleDragOver); inputArea.addEventListener('drop', handleDrop); }
});

async function triggerImageUpload() {
    document.getElementById('image-upload-input').click();
}

function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); }
function handleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    const imageFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) handleFileUpload(imageFiles);
}

async function handleFileUpload(files) {
    const server = window.getEnabledMediaServer();
    if (!server) { showError('No media server configured. Please add a media server in settings.'); openSettings(); return; }
    const input = document.getElementById('message-input');
    for (const file of files) {
        try {
            showUploadProgress(file.name);
            const imageUrl = await window.uploadImage(file, server);
            hideUploadProgress();
            if (input) {
                const cursorPosition = input.selectionStart || input.value.length;
                const beforeCursor = input.value.substring(0, cursorPosition);
                const afterCursor = input.value.substring(cursorPosition);
                const spaceBefore = beforeCursor.length > 0 && !beforeCursor.endsWith(' ') ? ' ' : '';
                const spaceAfter = afterCursor.length > 0 && !afterCursor.startsWith(' ') ? ' ' : '';
                input.value = beforeCursor + spaceBefore + imageUrl + spaceAfter + afterCursor;
                const newPos = cursorPosition + spaceBefore.length + imageUrl.length + spaceAfter.length;
                input.setSelectionRange(newPos, newPos);
                input.focus();
            }
        } catch (error) {
            hideUploadProgress();
            showError(`Failed to upload ${file.name}: ${error.message}`);
        }
    }
}

function showUploadProgress(fileName) {
    const input = document.getElementById('message-input');
    input.value = `[Uploading ${fileName}...]`;
    input.disabled = true;
}

function hideUploadProgress() {
    const input = document.getElementById('message-input');
    input.value = '';
    input.disabled = false;
    input.focus();
}

const input = document.getElementById('message-input');
if (input) {
    input.addEventListener('paste', function (e) {
        const imageFiles = Array.from(e.clipboardData.items)
            .filter(item => item.type.indexOf('image') !== -1)
            .map(item => item.getAsFile())
            .filter(Boolean);
        if (imageFiles.length > 0) { e.preventDefault(); handleFileUpload(imageFiles); }
    });
}

function showDMContextMenu(event, dmServer) {
    contextMenu(event)
        .item('Mark as Read', () => markDMAsRead(dmServer), 'check-circle')
        .sep()
        .item('Remove from sidebar', () => {
            state.dmServers = state.dmServers.filter(dm => dm.channel !== dmServer.channel);
            localStorage.setItem('originchats_dm_servers', JSON.stringify(state.dmServers));
            renderGuildSidebar();
        }, 'x-circle')
        .show();
}

function openDMCreateModal() {
    const modal = document.getElementById('dm-create-modal');
    if (modal) { modal.classList.add('active'); if (window.lucide) window.lucide.createIcons({ root: modal }); }
}

function closeDMCreateModal() {
    document.getElementById('dm-create-modal')?.classList.remove('active');
    document.getElementById('dm-username').value = '';
    document.getElementById('group-name').value = '';
    document.getElementById('group-members').value = '';
}

function switchDMCreateTab(tab) {
    document.querySelectorAll('.dm-create-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dm-create-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.dm-create-tab[data-tab="${tab}"]`)?.classList.add('active');
    document.getElementById(`dm-create-${tab}-panel`)?.classList.add('active');
}

function createDirectMessage() {
    const username = document.getElementById('dm-username').value.trim();
    if (!username) { showErrorBanner('Please enter a username'); return; }
    const cmdsChannel = state.channels.find(c => c.name === 'cmds');
    if (cmdsChannel) {
        wsSend({ cmd: 'message_new', content: `dm add ${username}`, channel: 'cmds' }, 'dms.mistium.com');
        closeDMCreateModal();
        showErrorBanner(`Creating DM with ${username}...`);
    } else {
        showErrorBanner('Unable to create DM at this time');
    }
}

function createGroup() {
    const groupName = document.getElementById('group-name').value.trim().replace(/\s+/g, '-');
    const membersStr = document.getElementById('group-members').value.trim();
    if (!groupName) { showErrorBanner('Please enter a group name'); return; }
    if (!membersStr) { showErrorBanner('Please enter at least one member'); return; }
    const members = membersStr.split(',').map(m => m.trim()).filter(m => m);
    if (members.length === 0) { showErrorBanner('Please enter at least one member'); return; }
    const cmdsChannel = state.channels.find(c => c.name === 'cmds');
    if (cmdsChannel) {
        wsSend({ cmd: 'message_new', content: `group create ${groupName} ${members.join(' ')}`, channel: 'cmds' }, 'dms.mistium.com');
        closeDMCreateModal();
        showErrorBanner(`Creating group "${groupName}"...`);
    } else {
        showErrorBanner('Unable to create group at this time');
    }
}

window.addEventListener('focus', function () {
    const allServerUrls = [...state.servers.map(s => s.url), 'dms.mistium.com'];
    allServerUrls.forEach(url => { if (!wsConnections[url] || wsConnections[url].status !== 'connected') connectToServer(url); });
    setTimeout(() => {
        allServerUrls.forEach(url => {
            const conn = wsConnections[url];
            if (conn && conn.status === 'connected') {
                (state.channelsByServer[url] || []).forEach(channel => {
                    const channelKey = `${url}:${channel.name}`;
                    if (state.messagesByServer[url]?.[channel.name] && !state.pendingMessageFetchesByChannel[channelKey]) {
                        state.pendingMessageFetchesByChannel[channelKey] = true;
                        wsSend({ cmd: 'messages_get', channel: channel.name }, url);
                    }
                });
            }
        });
    }, 500);
});

window.selectEmoji = selectEmoji;

function initVoiceSettings() {
    const thresholdSlider = document.getElementById('mic-threshold-slider');
    const thresholdValue = document.getElementById('mic-threshold-value');
    if (!thresholdSlider || !thresholdValue) return;
    const currentThreshold = voiceManager ? voiceManager.micThreshold : parseInt(localStorage.getItem('originchats_mic_threshold') || '30', 10);
    thresholdSlider.value = currentThreshold;
    thresholdValue.textContent = currentThreshold;
    if (thresholdSlider._settingsInit) return;
    thresholdSlider._settingsInit = true;
    thresholdSlider.addEventListener('input', (e) => {
        thresholdValue.textContent = e.target.value;
        if (voiceManager) voiceManager.setMicThreshold(parseInt(e.target.value, 10));
    });
    thresholdSlider.addEventListener('change', (e) => {
        if (voiceManager) voiceManager.setMicThreshold(parseInt(e.target.value, 10));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.settings-nav .nav-item');
    const sections = document.querySelectorAll('.settings-section');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;
            if (!sectionId) return;
            navItems.forEach(ni => ni.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`section-${sectionId}`)?.classList.add('active');
            if (sectionId === 'voice') initVoiceSettings();
            if (sectionId === 'privacy') initPrivacySettings();
            if (sectionId === 'chat') initChatSettings();
            if (sectionId === 'appearance') initAppearanceSettings();
        });
    });
});

window.initVoiceSettings = initVoiceSettings;

function initPrivacySettings() {
    const modeSelect = document.getElementById('blocked-messages-mode');
    const previewContent = document.getElementById('preview-content');
    if (!modeSelect || !previewContent) return;
    const currentMode = localStorage.getItem('originchats_blocked_mode') || 'collapse';
    modeSelect.value = currentMode;
    updateBlockedPreview(currentMode, previewContent);
    if (modeSelect._settingsInit) return;
    modeSelect._settingsInit = true;
    modeSelect.addEventListener('change', (e) => {
        localStorage.setItem('originchats_blocked_mode', e.target.value);
        updateBlockedPreview(e.target.value, previewContent);
        renderMessages();
    });
}

function updateBlockedPreview(mode, container) {
    const previews = {
        hide: `<div style="color: var(--text-dim); font-style: italic;">Messages from blocked users will be completely hidden from view.</div>`,
        dim: `<div style="opacity: 0.3; transition: opacity 0.2s ease;"><div style="font-weight: 600; font-size: 14px;">BlockedUser</div><div style="margin-top: 4px;">This is a message from a blocked user</div></div>`,
        collapse: `<div class="blocked-notice" style="display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px; background: rgba(237, 66, 69, 0.1); border-radius: 8px; color: var(--danger);"><span>Message from blocked user – </span><button class="blocked-show-btn" style="background: none; border: none; color: var(--danger); font-weight: 600; cursor: pointer; padding: 0;">Show</button></div>`
    };
    container.innerHTML = previews[mode] || previews.collapse;
}

function getBlockedMessagesMode() {
    return localStorage.getItem('originchats_blocked_mode') || 'collapse';
}

window.initPrivacySettings = initPrivacySettings;
window.updateBlockedPreview = updateBlockedPreview;
window.getBlockedMessagesMode = getBlockedMessagesMode;

function initChatSettings() {
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValue = document.getElementById('font-size-value');
    const showEmbeds = document.getElementById('show-embeds');
    const showTimestamps = document.getElementById('show-timestamps');

    if (fontSizeSlider && fontSizeValue) {
        const currentFontSize = localStorage.getItem('originchats_font_size') || '15';
        fontSizeSlider.value = currentFontSize;
        fontSizeValue.textContent = currentFontSize + 'px';
        applyFontSize(currentFontSize);
        if (!fontSizeSlider._settingsInit) {
            fontSizeSlider._settingsInit = true;
            fontSizeSlider.addEventListener('input', (e) => { fontSizeValue.textContent = e.target.value + 'px'; applyFontSize(e.target.value); });
            fontSizeSlider.addEventListener('change', (e) => localStorage.setItem('originchats_font_size', e.target.value));
        }
    }

    if (showEmbeds) {
        const current = localStorage.getItem('originchats_show_embeds') !== 'false';
        showEmbeds.checked = current;
        window.shouldShowEmbeds = current;
        if (!showEmbeds._settingsInit) {
            showEmbeds._settingsInit = true;
            showEmbeds.addEventListener('change', (e) => { localStorage.setItem('originchats_show_embeds', e.target.checked); window.shouldShowEmbeds = e.target.checked; renderMessages(); });
        }
    }

    if (showTimestamps) {
        const current = localStorage.getItem('originchats_show_timestamps') !== 'false';
        showTimestamps.checked = current;
        window.showTimestamps = current;
        if (!showTimestamps._settingsInit) {
            showTimestamps._settingsInit = true;
            showTimestamps.addEventListener('change', (e) => { localStorage.setItem('originchats_show_timestamps', e.target.checked); window.showTimestamps = e.target.checked; renderMessages(); });
        }
    }
}

function applyFontSize(size) {
    document.documentElement.style.setProperty('--message-font-size', size + 'px');
}

function initAppearanceSettings() {
    const themeSelect = document.getElementById('color-theme-select');
    const wallpaperUpload = document.getElementById('wallpaper-upload');
    const wallpaperPreview = document.getElementById('wallpaper-preview');
    const clearWallpaperBtn = document.getElementById('clear-wallpaper-btn');
    const wallpaperOpacity = document.getElementById('wallpaper-opacity');
    const wallpaperOpacitySlider = document.getElementById('wallpaper-opacity-slider');
    const themePreviews = document.querySelectorAll('.theme-preview-option');
    const fontFamilySelect = document.getElementById('font-family-select');
    const messageGrouping = document.getElementById('message-grouping');
    const enableAnimations = document.getElementById('enable-animations');
    const gifAutoplay = document.getElementById('gif-autoplay');
    const reduceMotion = document.getElementById('reduce-motion');
    const showScrollbars = document.getElementById('show-scrollbars');
    const showAvatarBorders = document.getElementById('show-avatar-borders');
    const showMessageShadows = document.getElementById('show-message-shadows');

    // Apply current values from localStorage
    const applyBooleanSetting = (el, key, defaultVal, applyFn) => {
        if (!el) return;
        const val = localStorage.getItem(key) !== 'false' ? defaultVal : !defaultVal;
        // Determine actual value: if default is true, absence means true; if default is false, absence means false
        const stored = localStorage.getItem(key);
        const actual = stored !== null ? stored === 'true' : defaultVal;
        el.checked = actual;
        if (applyFn) applyFn(actual);
    };

    if (themeSelect) { const t = localStorage.getItem('originchats_theme') || 'dark'; themeSelect.value = t; applyTheme(t); }
    updateThemePreview(localStorage.getItem('originchats_theme') || 'dark');

    if (messageGrouping) {
        const v = localStorage.getItem('originchats_message_grouping') !== 'false';
        messageGrouping.checked = v;
    }
    if (fontFamilySelect) { const f = localStorage.getItem('originchats_font_family') || 'system'; fontFamilySelect.value = f; applyFontFamily(f); }

    if (wallpaperUpload) {
        const wp = localStorage.getItem('originchats_wallpaper');
        const opacity = localStorage.getItem('originchats_wallpaper_opacity') || '100';
        if (wp) { applyWallpaper(wp, opacity); updateWallpaperPreview(wp); }
        if (wallpaperOpacitySlider) {
            wallpaperOpacitySlider.value = opacity;
            const opVal = document.getElementById('wallpaper-opacity-value');
            if (opVal) opVal.textContent = opacity + '%';
        }
    }
    if (wallpaperOpacity) { const d = localStorage.getItem('originchats_wallpaper_dimmed') === 'true'; wallpaperOpacity.checked = d; applyWallpaperDimming(d); }

    const boolSettings = [
        [enableAnimations, 'originchats_enable_animations', true, applyAnimations],
        [gifAutoplay, 'originchats_gif_autoplay', true, v => { window.gifAutoplayEnabled = v; }],
        [reduceMotion, 'originchats_reduce_motion', false, applyReduceMotion],
        [showScrollbars, 'originchats_show_scrollbars', true, applyScrollbars],
        [showAvatarBorders, 'originchats_show_avatar_borders', true, applyAvatarBorders],
        [showMessageShadows, 'originchats_show_message_shadows', true, applyMessageShadows]
    ];
    boolSettings.forEach(([el, key, defaultVal, applyFn]) => {
        if (!el) return;
        const stored = localStorage.getItem(key);
        const actual = stored !== null ? stored === 'true' : defaultVal;
        el.checked = actual;
        if (applyFn) applyFn(actual);
    });

    if (initAppearanceSettings._initialized) return;
    initAppearanceSettings._initialized = true;

    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => { localStorage.setItem('originchats_theme', e.target.value); applyTheme(e.target.value); updateThemePreview(e.target.value); });
    }
    themePreviews.forEach(preview => {
        preview.addEventListener('click', () => {
            const theme = preview.dataset.theme;
            if (themeSelect) themeSelect.value = theme;
            localStorage.setItem('originchats_theme', theme);
            applyTheme(theme);
            updateThemePreview(theme);
        });
    });

    if (messageGrouping) {
        messageGrouping.addEventListener('change', (e) => { localStorage.setItem('originchats_message_grouping', e.target.checked); applyMessageGrouping(e.target.checked); });
    }
    if (fontFamilySelect) {
        fontFamilySelect.addEventListener('change', (e) => { localStorage.setItem('originchats_font_family', e.target.value); applyFontFamily(e.target.value); });
    }

    if (wallpaperUpload) {
        if (wallpaperOpacitySlider) {
            wallpaperOpacitySlider.addEventListener('input', (e) => {
                const opacity = e.target.value;
                const opVal = document.getElementById('wallpaper-opacity-value');
                if (opVal) opVal.textContent = opacity + '%';
                localStorage.setItem('originchats_wallpaper_opacity', opacity);
                const wp = localStorage.getItem('originchats_wallpaper');
                if (wp) applyWallpaper(wp, opacity);
            });
        }
        wallpaperUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    localStorage.setItem('originchats_wallpaper', dataUrl);
                    const opacity = wallpaperOpacitySlider ? wallpaperOpacitySlider.value : '100';
                    localStorage.setItem('originchats_wallpaper_opacity', opacity);
                    applyWallpaper(dataUrl, opacity);
                    updateWallpaperPreview(dataUrl);
                };
                reader.readAsDataURL(file);
            }
        });
    }
    if (clearWallpaperBtn) {
        clearWallpaperBtn.addEventListener('click', () => { localStorage.removeItem('originchats_wallpaper'); applyWallpaper('', '100'); updateWallpaperPreview(''); if (wallpaperUpload) wallpaperUpload.value = ''; });
    }
    if (wallpaperOpacity) {
        wallpaperOpacity.addEventListener('change', (e) => { localStorage.setItem('originchats_wallpaper_dimmed', e.target.checked); applyWallpaperDimming(e.target.checked); });
    }

    boolSettings.forEach(([el, key, , applyFn]) => {
        if (!el || el._settingsInit) return;
        el._settingsInit = true;
        el.addEventListener('change', (e) => { localStorage.setItem(key, e.target.checked); if (applyFn) applyFn(e.target.checked); });
    });
}

function applyMessageGrouping(enabled) {
    document.body.classList.toggle('no-message-grouping', !enabled);
    const messages = state.messagesByServer[state.serverUrl]?.[state.currentChannel?.name];
    if (messages) renderMessages(false);
}

function applyFontFamily(font) {
    document.body.classList.remove('font-system', 'font-geometric', 'font-humanist', 'font-mono', 'font-serif');
    if (font !== 'system') document.body.classList.add(`font-${font}`);
}

function applyAnimations(enabled) { document.body.classList.toggle('no-animations', !enabled); }
function applyReduceMotion(reduce) { document.body.classList.toggle('reduce-motion', reduce); }
function applyScrollbars(show) { document.body.classList.toggle('hide-scrollbars', !show); }
function applyAvatarBorders(show) { document.body.classList.toggle('hide-avatar-borders', !show); }
function applyMessageShadows(show) { document.body.classList.toggle('hide-message-shadows', !show); }

function updateThemePreview(theme) {
    document.querySelectorAll('.theme-preview-option').forEach(preview => {
        preview.style.borderColor = preview.dataset.theme === theme ? 'var(--primary)' : 'transparent';
    });
}

function updateWallpaperPreview(dataUrl) {
    const wallpaperPreview = document.getElementById('wallpaper-preview');
    if (!wallpaperPreview) return;
    if (dataUrl) { wallpaperPreview.style.display = 'block'; wallpaperPreview.style.backgroundImage = `url(${dataUrl})`; }
    else { wallpaperPreview.style.display = 'none'; wallpaperPreview.style.backgroundImage = 'none'; }
}

const themes = {
    dark: { '--bg': '#050505', '--surface': '#0a0a0c', '--surface-light': '#141419', '--surface-hover': '#1f1f26', '--border': '#2a2a33', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#4e5058', '--primary-hover': '#586068', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#00a8fc', '--mention': '#9b87f5' },
    midnight: { '--bg': '#0d1117', '--surface': '#161b22', '--surface-light': '#21262d', '--surface-hover': '#30363d', '--border': '#30363d', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#58a6ff', '--primary-hover': '#79b8ff', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#58a6ff', '--mention': '#58a6ff' },
    ocean: { '--bg': '#0a1628', '--surface': '#0f1f3a', '--surface-light': '#1a3a5c', '--surface-hover': '#2a5070', '--border': '#1a4a6c', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#4a9eff', '--primary-hover': '#60aaff', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#4a9eff', '--mention': '#4a9eff' },
    forest: { '--bg': '#0a1a10', '--surface': '#0f2a18', '--surface-light': '#1a4028', '--surface-hover': '#2a5538', '--border': '#1a4528', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#4ade80', '--primary-hover': '#5ce68a', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#4ade80', '--mention': '#4ade80' },
    sunset: { '--bg': '#1a0a14', '--surface': '#2a1020', '--surface-light': '#401830', '--surface-hover': '#5a2840', '--border': '#402030', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#fb7185', '--primary-hover': '#fc8a9a', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#fb7185', '--mention': '#fb7185' },
    purple: { '--bg': '#1a0a28', '--surface': '#281040', '--surface-light': '#401860', '--surface-hover': '#5a2878', '--border': '#402055', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#c084fc', '--primary-hover': '#d8a6fd', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#c084fc', '--mention': '#c084fc' },
    rose: { '--bg': '#1a0a1a', '--surface': '#2a1420', '--surface-light': '#402030', '--surface-hover': '#502840', '--border': '#402830', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#fb6b8b', '--primary-hover': '#fc8aa5', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#fb6b8b', '--mention': '#fb6b8b' },
    amber: { '--bg': '#1a140a', '--surface': '#2a2010', '--surface-light': '#402818', '--surface-hover': '#503820', '--border': '#402818', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#fb923c', '--primary-hover': '#fca560', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#fb923c', '--mention': '#fb923c' },
    cyan: { '--bg': '#0a141a', '--surface': '#102028', '--surface-light': '#183040', '--surface-hover': '#284050', '--border': '#183040', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#22d3ee', '--primary-hover': '#4ae4f7', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#22d3ee', '--mention': '#22d3ee' },
    emerald: { '--bg': '#0a1a14', '--surface': '#102818', '--surface-light': '#183828', '--surface-hover': '#284838', '--border': '#183828', '--text': '#ededed', '--text-dim': '#a0a0a0', '--primary': '#10b981', '--primary-hover': '#34d399', '--danger': '#ed4245', '--success': '#3ba55c', '--link': '#10b981', '--mention': '#10b981' }
};

function applyTheme(themeName) {
    const theme = themes[themeName] || themes.dark;
    const root = document.documentElement;
    for (const [property, value] of Object.entries(theme)) root.style.setProperty(property, value);
}

function applyWallpaper(dataUrl, opacity = '100') {
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;
    if (dataUrl) {
        Object.assign(messagesContainer.style, { backgroundImage: `url(${dataUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundAttachment: 'scroll', opacity: opacity / 100 });
        messagesContainer.classList.add('has-wallpaper');
    } else {
        messagesContainer.style.backgroundImage = 'none';
        messagesContainer.style.opacity = '1';
        messagesContainer.classList.remove('has-wallpaper');
        messagesContainer.style.boxShadow = 'none';
    }
}

function applyWallpaperDimming(dimmed) {
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;
    messagesContainer.style.boxShadow = dimmed ? 'inset 0 0 100px rgba(0, 0, 0, 0.8)' : 'none';
}

window.initChatSettings = initChatSettings;
window.initAppearanceSettings = initAppearanceSettings;

document.addEventListener('DOMContentLoaded', () => {
    // Apply all persisted settings on load
    const settingsToApply = [
        [localStorage.getItem('originchats_font_size'), v => applyFontSize(v)],
        [localStorage.getItem('originchats_theme'), v => applyTheme(v)],
        [localStorage.getItem('originchats_message_grouping'), v => applyMessageGrouping(v === 'true')],
        [localStorage.getItem('originchats_font_family'), v => applyFontFamily(v)],
        [localStorage.getItem('originchats_enable_animations'), v => applyAnimations(v === 'true')],
        [localStorage.getItem('originchats_reduce_motion'), v => v === 'true' && applyReduceMotion(true)],
        [localStorage.getItem('originchats_show_scrollbars'), v => applyScrollbars(v === 'true')],
        [localStorage.getItem('originchats_show_avatar_borders'), v => applyAvatarBorders(v === 'true')],
        [localStorage.getItem('originchats_show_message_shadows'), v => applyMessageShadows(v === 'true')]
    ];
    settingsToApply.forEach(([val, fn]) => { if (val !== null) fn(val); });

    const savedWallpaper = localStorage.getItem('originchats_wallpaper');
    const savedWallpaperOpacity = localStorage.getItem('originchats_wallpaper_opacity') || '100';
    if (savedWallpaper) {
        applyWallpaper(savedWallpaper, savedWallpaperOpacity);
        applyWallpaperDimming(localStorage.getItem('originchats_wallpaper_dimmed') === 'true');
    }

    window.shouldShowEmbeds = localStorage.getItem('originchats_show_embeds') !== 'false';
    window.showTimestamps = localStorage.getItem('originchats_show_timestamps') !== 'false';
    window.gifAutoplayEnabled = localStorage.getItem('originchats_gif_autoplay') !== 'false';

    // Scroll to bottom button
    const scrollBtn = document.getElementById('scroll-to-bottom');
    const messagesEl = document.getElementById('messages');

    if (scrollBtn && messagesEl) {
        const updateScrollButton = () => {
            const isNearBottom = (messagesEl.scrollHeight - (messagesEl.scrollTop + messagesEl.clientHeight)) < 80;
            scrollBtn.style.display = isNearBottom ? 'none' : 'flex';
        };

        messagesEl.addEventListener('scroll', updateScrollButton);

        scrollBtn.addEventListener('click', () => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });

        const observer = new MutationObserver(updateScrollButton);
        observer.observe(messagesEl, { childList: true, subtree: true });
    }
});

window.openMessageSearch = function () {
  if (!window.MembersContent) return;
  if (window.state?.serverUrl === 'dms.mistium.com' && (!window.state?.currentChannel || ['home', 'relationships', 'notes', 'new_message'].includes(window.state.currentChannel.name))) {
    return;
  }
  if (!window.state?.currentChannel) return;
  if (isMediumScreen()) {
    openMembersOverlay();
  }
  window.MembersContent.render({ type: 'search', channel: window.state.currentChannel });
};

window.openPinnedMessages = function () {
  if (!window.MembersContent) return;
  if (window.state?.serverUrl === 'dms.mistium.com' && (!window.state?.currentChannel || ['home', 'relationships', 'notes', 'new_message'].includes(window.state.currentChannel.name))) {
    return;
  }
  if (!window.state?.currentChannel) return;
  if (isMediumScreen()) {
    openMembersOverlay();
  }
  window.MembersContent.render({ type: 'pinned', channel: window.state.currentChannel });
};
