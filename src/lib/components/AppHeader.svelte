<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { goto, invalidateAll } from '$app/navigation';
  import { auth, db } from '$lib/firebase.js';
  import { onAuthStateChanged } from 'firebase/auth';
  import { doc, getDoc, collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
  import type { InvitationForFrontend, UserNotificationForFrontend } from '$lib/types/collaboration';
  import { getRoleDisplayName } from '$lib/types/collaboration';

  export let isDarkMode: boolean = false;
  export let username: string = 'User';
  export let currentDateTime: string = '';

  const dispatch = createEventDispatcher();

  let showLogoutConfirm = false;
  let profilePicture: string = '';
  let showNotifDropdown = false;
  let showProfileDropdown = false;

  // Pending invitations state
  let pendingInvitations: InvitationForFrontend[] = [];
  let isLoadingInvitations = false;
  let invitationActionLoading: string | null = null;

  // User notifications state
  let userNotifications: UserNotificationForFrontend[] = [];
  let isLoadingNotifications = false;

  let dateTimeInterval: ReturnType<typeof setInterval> | null = null;
  let notificationAudio: HTMLAudioElement | null = null;

  function updateDateTime() {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    };
    currentDateTime = now.toLocaleDateString('en-US', options);
  }

  function toggleSidebar() {
    dispatch('toggleSidebar');
  }

  function toggleDarkMode() {
    dispatch('toggleDarkMode');
  }

  function toggleNotifDropdown(e: MouseEvent) {
    e.stopPropagation();
    showNotifDropdown = !showNotifDropdown;
    showProfileDropdown = false;
    // Real-time listeners (onSnapshot) handle updates - no need to manually fetch
  }

  function playNotificationSound() {
    if (browser) {
      try {
        // Use Web Audio API for volume above 100%
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        fetch('/mambou.mp3')
          .then(response => response.arrayBuffer())
          .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
          .then(audioBuffer => {
            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            
            source.buffer = audioBuffer;
            gainNode.gain.value = 2.0; // 200% volume
            
            source.connect(gainNode);
            gainNode.connect(audioContext.destination);
            source.start(0);
          })
          .catch(err => {
            console.log('Could not play notification sound:', err);
          });
      } catch (err) {
        console.error('Failed to play notification sound:', err);
      }
    }
  }

  async function loadPendingInvitations(isInitialLoad = false) {
    // Only show loading indicator on initial load, not during polling
    if (isInitialLoad) {
      isLoadingInvitations = true;
    }
    try {
      const res = await fetch('/api/workspace/invitations?mine=true');
      if (res.ok) {
        const data = await res.json();
        const newInvitations = data.invitations || [];
        
        // Play sound if there are invitations on initial load or new ones added
        if (newInvitations.length > 0 && (isInitialLoad || newInvitations.length > pendingInvitations.length)) {
          playNotificationSound();
        }
        
        pendingInvitations = newInvitations;
      }
    } catch (err) {
      console.error('Failed to load invitations:', err);
    } finally {
      isLoadingInvitations = false;
    }
  }

  async function loadUserNotifications(isInitialLoad = false) {
    if (isInitialLoad) {
      isLoadingNotifications = true;
    }
    try {
      // Include read notifications so they stay visible
      const res = await fetch('/api/notifications?includeRead=true');
      if (res.ok) {
        const data = await res.json();
        const newNotifications = data.notifications || [];
        
        // Only play sound if there are MORE unread notifications than before (not on initial load)
        const unreadCount = newNotifications.filter((n: any) => !n.isRead).length;
        const prevUnreadCount = userNotifications.filter(n => !n.isRead).length;
        if (!isInitialLoad && unreadCount > prevUnreadCount) {
          playNotificationSound();
        }
        
        userNotifications = newNotifications;
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      isLoadingNotifications = false;
    }
  }

  async function markNotificationRead(notificationId: string) {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId })
      });
      if (res.ok) {
        // Mark as read locally instead of removing
        userNotifications = userNotifications.map(n => 
          n.id === notificationId ? { ...n, isRead: true } : n
        );
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }

  async function markAllNotificationsRead() {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true })
      });
      if (res.ok) {
        // Mark all as read locally instead of removing
        userNotifications = userNotifications.map(n => ({ ...n, isRead: true }));
        console.log('All notifications marked as read');
      } else {
        console.error('Failed to mark all notifications as read:', await res.text());
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }

  async function dismissNotification(notificationId: string) {
    try {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId })
      });
      if (res.ok) {
        userNotifications = userNotifications.filter(n => n.id !== notificationId);
      }
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  }

  async function handleInvitation(invitationId: string, action: 'accept' | 'decline') {
    invitationActionLoading = invitationId;
    try {
      const res = await fetch('/api/workspace/invitations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId, action })
      });

      if (res.ok) {
        pendingInvitations = pendingInvitations.filter(i => i.id !== invitationId);
        if (action === 'accept') {
          // Refresh data and navigate to workspace list
          await invalidateAll();
          goto('/workspace');
        }
      }
    } catch (err) {
      console.error('Failed to handle invitation:', err);
    } finally {
      invitationActionLoading = null;
    }
  }



  function toggleProfileDropdown(e: MouseEvent) {
    e.stopPropagation();
    showProfileDropdown = !showProfileDropdown;
    showNotifDropdown = false;
    showHelpDropdown = false;
  }

  function closeAllDropdowns() {
    showNotifDropdown = false;
    showProfileDropdown = false;
  }

  function handleGlobalClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown-trigger') && !target.closest('.dropdown-window')) {
      closeAllDropdowns();
    }
  }

  function openLogoutConfirm() {
    showLogoutConfirm = true;
    closeAllDropdowns();
  }

  function cancelLogout() {
    showLogoutConfirm = false;
  }

  function confirmLogout() {
    showLogoutConfirm = false;
    if (browser) {
      localStorage.removeItem('microtask_username');
      document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
      goto('/login');
    }
  }

  // Real-time listener unsubscribe functions (NO POLLING - pure real-time)
  let unsubscribeInvitations: (() => void) | null = null;
  let unsubscribeNotifications: (() => void) | null = null;
  let currentUserEmail: string | null = null;
  let currentUserId: string | null = null;
  let isInitialNotificationLoad = true; // Track if this is the first notification load
  let isInitialInvitationLoad = true; // Track if this is the first invitation load

  onMount(() => {
    if (browser) {
      updateDateTime();
      dateTimeInterval = setInterval(updateDateTime, 60000);

      // Set up real-time listeners when user is authenticated
      // Pure onSnapshot - NO POLLING
      const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUserId = user.uid;
          
          // Get user email and profile picture
          try {
            const credRef = doc(db, "credentials", user.uid);
            const credSnap = await getDoc(credRef);
            if (credSnap.exists()) {
              currentUserEmail = credSnap.data().email;
              if (credSnap.data().photoBase64) {
                profilePicture = credSnap.data().photoBase64;
              } else if (user.photoURL) {
                // Fallback to Google profile picture
                profilePicture = user.photoURL;
              }
              
              // Real-time listener for invitations
              if (currentUserEmail) {
                const invitationsQuery = query(
                  collection(db, 'workspace_invitations'),
                  where('invitedEmail', '==', currentUserEmail),
                  where('status', '==', 'pending')
                );
                
                unsubscribeInvitations = onSnapshot(invitationsQuery, (snapshot) => {
                  const newInvitations = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                  })) as InvitationForFrontend[];
                  
                  // Play sound if new invitations appeared (not on initial load)
                  if (!isInitialInvitationLoad && newInvitations.length > pendingInvitations.length) {
                    console.log('[Invitations] New invitation! Playing sound.');
                    playNotificationSound();
                  }
                  
                  isInitialInvitationLoad = false;
                  pendingInvitations = newInvitations;
                  isLoadingInvitations = false;
                }, (error) => {
                  console.error('Error listening to invitations:', error);
                  isLoadingInvitations = false;
                });
              }
              
              // Real-time listener for notifications
              console.log('[Notifications] Setting up listener for userId:', user.uid);
              const notificationsQuery = query(
                collection(db, 'user_notifications'),
                where('userId', '==', user.uid),
                limit(50)
              );
              
              unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
                const newNotifications = snapshot.docs.map(doc => {
                  const data = doc.data();
                  return {
                    id: doc.id,
                    userId: data.userId,
                    type: data.type,
                    title: data.title,
                    message: data.message,
                    workspaceId: data.workspaceId,
                    workspaceName: data.workspaceName,
                    taskId: data.taskId,
                    taskTitle: data.taskTitle,
                    fromUserId: data.fromUserId,
                    fromUsername: data.fromUsername,
                    isRead: data.isRead,
                    createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                  };
                }) as UserNotificationForFrontend[];
                
                // Sort by createdAt (most recent first)
                newNotifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                
                // Play sound if new unread notifications appeared (but not on initial load)
                const unreadCount = newNotifications.filter(n => !n.isRead).length;
                const prevUnreadCount = userNotifications.filter(n => !n.isRead).length;
                
                console.log('[Notifications] onSnapshot fired:', {
                  isInitialLoad: isInitialNotificationLoad,
                  newCount: newNotifications.length,
                  prevCount: userNotifications.length,
                  unreadCount,
                  prevUnreadCount,
                  shouldPlaySound: !isInitialNotificationLoad && unreadCount > prevUnreadCount
                });
                
                if (!isInitialNotificationLoad && unreadCount > prevUnreadCount) {
                  console.log('[Notifications] Playing sound!');
                  playNotificationSound();
                }
                
                // After first load, new notifications should trigger sound
                isInitialNotificationLoad = false;
                
                userNotifications = newNotifications;
                isLoadingNotifications = false;
              }, (error) => {
                console.error('Error listening to notifications:', error);
                isLoadingNotifications = false;
              });
              
            } else if (user.photoURL) {
              profilePicture = user.photoURL;
            }
          } catch (error) {
            console.error("Error fetching user data:", error);
            if (user.photoURL) {
              profilePicture = user.photoURL;
            }
          }
        } else {
          // User logged out - clean up listeners
          if (unsubscribeInvitations) {
            unsubscribeInvitations();
            unsubscribeInvitations = null;
          }
          if (unsubscribeNotifications) {
            unsubscribeNotifications();
            unsubscribeNotifications = null;
          }
          currentUserEmail = null;
          currentUserId = null;
          pendingInvitations = [];
          userNotifications = [];
        }
      });

      return () => {
        if (dateTimeInterval) clearInterval(dateTimeInterval);
        if (unsubscribeInvitations) unsubscribeInvitations();
        if (unsubscribeNotifications) unsubscribeNotifications();
        unsubscribeAuth();
      };
    }
  });

  onDestroy(() => {
    if (dateTimeInterval) clearInterval(dateTimeInterval);
    if (unsubscribeInvitations) unsubscribeInvitations();
    if (unsubscribeNotifications) unsubscribeNotifications();
  });
</script>

<svelte:window on:click={handleGlobalClick} />

<header class={`top-header ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
  <div class="header-left">
    <button id="hamburgerButton" class="menu-btn" on:click={toggleSidebar} aria-label="Toggle Sidebar">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    </button>
    <a href="/home" class="logo">
      <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="h-8 w-auto">
      <span class={`${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</span>
    </a>
  </div>

  <div class={`flex items-center gap-4 mr-4 right text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-900'}`}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
      <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" />
      <path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/>
    </svg>
    <span>{currentDateTime}</span>
  </div>

  <div class="header-icons">
    <div class="relative">
      <button on:click={toggleNotifDropdown} aria-label="Notifications" class="dropdown-trigger relative">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
          <path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0c-1.673-.253-3.287-.673-4.831-1.243a.75.75 0 01-.297-1.206C4.45 13.807 5.25 11.873 5.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0H9.752z" clip-rule="evenodd" />
        </svg>
        {#if pendingInvitations.length + userNotifications.filter(n => !n.isRead).length > 0}
          <span class="notif-badge">{pendingInvitations.length + userNotifications.filter(n => !n.isRead).length}</span>
        {/if}
      </button>
      {#if showNotifDropdown}
      <div class={`dropdown-window w-96 max-h-96 overflow-y-auto custom-scrollbar ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
        <div class="mb-3 notif-header">
          <h3 class="font-semibold text-sm">Notifications</h3>
          {#if userNotifications.some(n => !n.isRead)}
            <button 
              class="mark-all-btn text-xs text-blue-500 hover:text-blue-600 hover:underline mr-5"
              on:click|stopPropagation={markAllNotificationsRead}
            >
              Mark as read
            </button>
          {/if}
        </div>
        
          {#if isLoadingInvitations && isLoadingNotifications}
          <p class="text-xs text-center py-4">Loading...</p>
        {:else if pendingInvitations.length === 0 && userNotifications.length === 0}
          <p class="text-xs text-center py-4 opacity-70">No new notifications.</p>
        {:else}
          <div class="space-y-3">
            <!-- Workspace Invitations (render first so invites appear at top) -->
            {#each pendingInvitations as invitation (invitation.id)}
              <div class={`invitation-card p-3 rounded-lg ${isDarkMode ? 'bg-zinc-600' : 'bg-gray-50'}`}>
                <div class="flex items-start gap-2 mb-2">
                  <div class="invitation-icon flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-500">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium truncate">Workspace Invitation</p>
                    <p class="text-xs mt-1">
                      <strong>{invitation.invitedByUsername}</strong> invited you to join 
                      <strong class="text-blue-500">{invitation.workspaceName}</strong>
                    </p>
                    <p class="text-xs mt-1 opacity-70">
                      Role: <span class="capitalize">{getRoleDisplayName(invitation.role)}</span>
                    </p>
                  </div>
                </div>
                <div class="flex gap-2 mt-2">
                  <button 
                    class="invitation-btn accept-btn flex-1 text-xs py-1.5 px-3 rounded font-medium"
                    disabled={invitationActionLoading === invitation.id}
                    on:click={() => handleInvitation(invitation.id, 'accept')}
                  >
                    {invitationActionLoading === invitation.id ? '...' : 'Accept'}
                  </button>
                  <button 
                    class="invitation-btn decline-btn flex-1 text-xs py-1.5 px-3 rounded font-medium"
                    disabled={invitationActionLoading === invitation.id}
                    on:click={() => handleInvitation(invitation.id, 'decline')}
                  >
                    Decline
                  </button>
                </div>
              </div>
            {/each}

            <!-- Task Assignment Notifications -->
            {#each userNotifications as notification (notification.id)}
              <div class={`notification-card p-3 rounded-lg transition-opacity ${notification.isRead ? 'opacity-50' : ''} ${isDarkMode ? (notification.isRead ? 'bg-zinc-700' : 'bg-zinc-600') : (notification.isRead ? 'bg-gray-100' : 'bg-blue-50')}`}>
                <div class="flex justify-between items-start">
                  <div class="flex-1">
                    <p class={`text-sm ${notification.isRead ? 'font-normal' : 'font-medium'}`}>{notification.title}</p>
                    <p class="text-xs mt-1 opacity-80">{notification.message}</p>
                    {#if notification.workspaceName}
                      <p class="text-xs mt-1 opacity-60">in {notification.workspaceName}</p>
                    {/if}
                    <p class="text-xs mt-1 opacity-50">{notification.timeAgo}</p>
                  </div>
                  <button 
                    class="text-xs opacity-60 hover:opacity-100 ml-2"
                    on:click|stopPropagation={() => notification.isRead ? dismissNotification(notification.id) : markNotificationRead(notification.id)}
                    title={notification.isRead ? 'Dismiss' : 'Mark as read'}
                  >
                    ✕
                  </button>
                </div>
                {#if notification.taskId && notification.workspaceId}
                  <button 
                    class="mt-2 text-xs text-blue-500 hover:text-blue-600"
                    on:click|stopPropagation={() => { goto(`/workspace/${notification.workspaceId}`); showNotifDropdown = false; }}
                  >
                    View →
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {/if}
    </div>

    <div class="relative">
      <button on:click={toggleProfileDropdown} aria-label="Profile Menu" class="dropdown-trigger w-12 h-12 rounded-full overflow-hidden flex-shrink-0 p-0 border-0 bg-transparent cursor-pointer">
        {#if profilePicture}
          <img src={profilePicture} alt="Profile" class="w-full h-full rounded-full object-cover" />
        {:else}
          <div class="w-full h-full rounded-full bg-blue-500 flex items-center justify-center">
            <span class="text-white text-xl font-semibold">{username ? username.charAt(0).toUpperCase() : 'U'}</span>
          </div>
        {/if}
      </button>
      {#if showProfileDropdown}
      <div class={`dropdown-window ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
        <!-- Profile Picture in Dropdown -->
        <div class="flex flex-col items-center mb-3 pb-3 border-b {isDarkMode ? 'border-zinc-600' : 'border-gray-200'}">
          {#if profilePicture}
            <img src={profilePicture} alt="Profile" class="w-16 h-16 rounded-full object-cover mb-2" />
          {:else}
            <div class="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center mb-2">
              <span class="text-white text-2xl font-semibold">{username ? username.charAt(0).toUpperCase() : 'U'}</span>
            </div>
          {/if}
          <p class="font-semibold text-sm">{username || 'User'}</p>
        </div>
        <a href="/settings" class={`flex items-center gap-2 text-xs px-2 py-1.5 rounded w-full transition-colors duration-150 mb-2 ${isDarkMode ? 'hover:bg-zinc-600 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
            <path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd" />
          </svg>
          Settings
        </a>
        <button on:click={openLogoutConfirm} class={`flex items-center gap-2 text-xs px-2 py-1.5 rounded w-full text-left transition-colors duration-150 ${isDarkMode ? 'bg-red-700 hover:bg-red-600 text-zinc-300' : 'bg-red-100 hover:bg-red-200 text-red-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
            <path fill-rule="evenodd" d="M7.5 3.75A1.5 1.5 0 006 5.25v13.5a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3h-6a3 3 0 01-3-3V5.25a3 3 0 013-3h6a3 3 0 013 3V9a.75.75 0 01-1.5 0V5.25a1.5 1.5 0 00-1.5-1.5h-6zm10.72 4.72a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H9a.75.75 0 010-1.5h10.94l-1.72-1.72a.75.75 0 010-1.06z" clip-rule="evenodd" />
          </svg>
          Logout
        </button>
      </div>
      {/if}
    </div>

    <button on:click={toggleDarkMode} aria-label="Toggle Dark Mode" class={`ml-2 p-1.5 rounded-full transition-colors duration-150 ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
        {#if isDarkMode}
          <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 0 0-.103.103l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 0 0-1.06 0L9.63 1.615a.75.75 0 00-.102.103ZM12 3.75a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75ZM18.282 5.282a.75.75 0 00-1.06 0l-1.132 1.132a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 000-.103ZM19.5 12a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75ZM18.282 18.718a.75.75 0 000 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0l-1.132 1.132a.75.75 0 00.103.103ZM12 18.75a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75ZM5.718 18.718a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0L4.586 17.686a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 000-.103ZM4.5 12a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75ZM5.718 5.282a.75.75 0 000-1.06l-1.132-1.132a.75.75 0 00-1.06 0L2.39 4.114a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-.103ZM12 6.75a5.25 5.25 0 015.25 5.25 5.25 5.25 0 01-5.25 5.25 5.25 5.25 0 01-5.25-5.25 5.25 5.25 0 015.25-5.25Z" clip-rule="evenodd" />
        {:else}
          <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clip-rule="evenodd" />
        {/if}
      </svg>
    </button>
  </div>
</header>

<!-- Logout Confirmation Modal -->
{#if showLogoutConfirm}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm" on:click|self={cancelLogout} on:keydown={(e) => e.key === 'Escape' && cancelLogout()} role="dialog" aria-modal="true" aria-labelledby="logout-title">
    <div class={`rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 transform transition-all ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-white text-gray-900'}`}>
      <div class="flex items-center gap-3 mb-4">
        <div class={`p-2 rounded-full ${isDarkMode ? 'bg-red-900/50' : 'bg-red-100'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class={`w-6 h-6 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
            <path fill-rule="evenodd" d="M7.5 3.75A1.5 1.5 0 006 5.25v13.5a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3h-6a3 3 0 01-3-3V5.25a3 3 0 013-3h6a3 3 0 013 3V9a.75.75 0 01-1.5 0V5.25a1.5 1.5 0 00-1.5-1.5h-6zm10.72 4.72a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H9a.75.75 0 010-1.5h10.94l-1.72-1.72a.75.75 0 010-1.06z" clip-rule="evenodd" />
          </svg>
        </div>
        <h2 id="logout-title" class="text-lg font-semibold">Confirm Logout</h2>
      </div>
      <p class={`mb-6 text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>
        Are you sure you want to log out? You will need to sign in again to access your tasks.
      </p>
      <div class="flex gap-3 justify-end">
        <button
          on:click={cancelLogout}
          class={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
        >
          Cancel
        </button>
        <button
          on:click={confirmLogout}
          class="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .top-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 60px;
    z-index: 40;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    transition: background-color 0.2s, border-color 0.2s;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .top-header .menu-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 9999px;
    transition: background-color 0.15s ease;
  }

  :global(.dark) .top-header .menu-btn:hover {
    background-color: #374151;
  }

  .top-header .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 1.125rem;
    text-decoration: none;
  }

  .top-header .header-icons {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .top-header .header-icons button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    width: 36px;
    height: 36px;
    transition: background-color 0.15s ease;
  }

  .top-header .header-icons button:hover {
    background-color: #f3f4f6;
  }

  :global(.dark) .top-header .header-icons button:hover {
    background-color: #374151;
  }

  .relative {
    position: relative;
  }

  .dropdown-window {
    /* Use fixed positioning so dropdowns don't get clipped by parent overflow
       and so they always stay within the viewport. Positioned below the
       fixed header (60px) with a small gap. */
    position: fixed;
    /* move the dropdown slightly left from the viewport edge to avoid truncation */
    right: 2.5rem;
    top: calc(60px + 8px);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 0.75rem 1rem; /* add extra right padding so text doesn't butt up against the edge */
    min-width: 320px;
    max-width: calc(100vw - 64px);
    box-sizing: border-box;
    z-index: 50;
    opacity: 0;
    transform: translateY(-5px) scale(0.98);
    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
    pointer-events: none;
    visibility: hidden;
  }

  .dropdown-window:not(.hidden) {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
    visibility: visible;
  }

  :global(.hidden) {
    display: none !important;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #c5c5c5 #f1f1f1;
  }

  :global(.dark) .custom-scrollbar {
    scrollbar-color: #4a5568 #2d3748;
  }

  /* Notification badge */
  .notif-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background-color: #ef4444;
    color: white;
    font-size: 0.65rem;
    font-weight: 600;
    min-width: 16px;
    height: 16px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
  }

  /* Notifications header layout */
  .notif-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .notif-header h3 {
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 0.5rem; /* ensure heading text is shifted left from the right edge */
  }

  .mark-all-btn {
    margin-left: 0.5rem;
    white-space: nowrap;
  }

  /* Invitation card styles */
  .invitation-card {
    border: 1px solid rgba(0, 0, 0, 0.05);
  }

  :global(body.dark) .invitation-card {
    border-color: rgba(255, 255, 255, 0.05);
  }

  .invitation-btn {
    cursor: pointer;
    transition: all 0.15s ease;
    font-weight: 500;
  }

  .invitation-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .accept-btn {
    background-color: #22c55e !important;
    color: white !important;
    border: none !important;
  }

  .accept-btn:hover:not(:disabled) {
    background-color: #16a34a !important;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(34, 197, 94, 0.3);
  }

  .decline-btn {
    background-color: #fee2e2 !important;
    color: #dc2626 !important;
    border: 1px solid #fecaca !important;
  }

  .decline-btn:hover:not(:disabled) {
    background-color: #fecaca !important;
    color: #b91c1c !important;
    transform: translateY(-1px);
  }

  :global(body.dark) .decline-btn {
    background-color: rgba(239, 68, 68, 0.15) !important;
    color: #f87171 !important;
    border-color: rgba(239, 68, 68, 0.3) !important;
  }

  :global(body.dark) .decline-btn:hover:not(:disabled) {
    background-color: rgba(239, 68, 68, 0.25) !important;
    color: #fca5a5 !important;
  }

  /* Notification card styles */
  .notification-card {
    border: 1px solid rgba(59, 130, 246, 0.2);
    background-color: rgba(59, 130, 246, 0.05);
  }

  :global(body.dark) .notification-card {
    border-color: rgba(59, 130, 246, 0.3);
    background-color: rgba(59, 130, 246, 0.1);
  }

  .notification-card.read {
    border-color: rgba(0, 0, 0, 0.05);
    background-color: transparent;
    opacity: 0.7;
  }

  :global(body.dark) .notification-card.read {
    border-color: rgba(255, 255, 255, 0.05);
  }

  .view-task-btn {
    background-color: #3b82f6 !important;
    color: white !important;
    border: none !important;
  }

  .view-task-btn:hover {
    background-color: #2563eb !important;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
  }

  .dismiss-btn {
    background-color: #f3f4f6 !important;
    color: #6b7280 !important;
    border: 1px solid #e5e7eb !important;
  }

  .dismiss-btn:hover {
    background-color: #e5e7eb !important;
    color: #4b5563 !important;
    transform: translateY(-1px);
  }

  :global(body.dark) .dismiss-btn {
    background-color: rgba(255, 255, 255, 0.1) !important;
    color: #9ca3af !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
  }

  :global(body.dark) .dismiss-btn:hover {
    background-color: rgba(255, 255, 255, 0.15) !important;
    color: #d1d5db !important;
  }
</style>
