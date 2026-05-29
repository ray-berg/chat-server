import React from 'react';
import { ChatProvider, useChat } from './data/store.jsx';
import Login from './Login.jsx';
import { WorkspaceRail, ChannelList } from './sidebar/Sidebar.jsx';
import { ChatHeader } from './main/ChatHeader.jsx';
import { Composer } from './main/Composer.jsx';
import { MessageList } from './main/messages.jsx';
import { RightRail } from './rail/RightRail.jsx';
import { CommandPalette } from './modals/CommandPalette.jsx';
import { HuddleFloater } from './modals/HuddleFloater.jsx';
import { ComposeDm } from './modals/ComposeDm.jsx';
import { SettingsPanel } from './modals/SettingsPanel.jsx';
import { CreateRoom } from './modals/CreateRoom.jsx';
import { AccessRequests } from './modals/AccessRequests.jsx';
import { AdminUsers } from './modals/AdminUsers.jsx';
import { GlobalSettings } from './modals/GlobalSettings.jsx';
import { Avatar, Button } from './components/atoms.jsx';
import { Icon } from './icons.jsx';

function CenterNote({ children }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-4)', background: 'var(--bg-app)' }}>
      {children}
    </div>
  );
}

function EmptyChannel({ channel, usersById }) {
  const dmUser = channel?.user ? usersById[channel.user] : null;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{ marginBottom: 14 }}>
        {dmUser ? (
          <Avatar user={dmUser} size={56} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-4)' }}>
            <Icon name={channel?.privacy === 'private' ? 'lock' : 'hash'} size={24} />
          </div>
        )}
      </div>
      <h2 style={{ fontSize: 18, color: 'var(--fg-1)', margin: 0 }}>{dmUser ? dmUser.name : channel ? `#${channel.name}` : 'No channel'}</h2>
      <p style={{ fontSize: 13, color: 'var(--fg-4)', maxWidth: 380, marginTop: 6 }}>
        {channel ? 'Send a message to kick it off, or use / to run a command.' : 'Select a channel to start.'}
      </p>
    </div>
  );
}

function DisconnectBanner({ connection }) {
  if (connection === 'open') return null;
  const label = connection === 'connecting' ? 'Connecting…' : 'Reconnecting… live updates paused';
  return (
    <div
      style={{
        padding: '4px 16px',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        color: 'var(--warn-300)',
        background: 'var(--tone-warn-soft)',
        borderBottom: '1px solid color-mix(in oklab, var(--warn-500) 35%, transparent)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn-400)', animation: 'chat-pulse 1.5s ease-in-out infinite' }} />
      {label}
    </div>
  );
}

function Shell() {
  const chat = useChat();
  const {
    currentUser,
    usersById,
    channels,
    activeChannel,
    activeChannelId,
    messages,
    typing,
    thinking,
    approvals,
    connection,
    selectChannel,
    sendMessage,
    sendTyping,
    setPresence,
    setAccent,
    updateProfile,
    uploadImage,
    changePassword,
    respondApproval,
    startDirect,
    searchUsers,
    createRoom,
    setRoomVisibility,
    fetchRoomRequests,
    respondRoomRequest,
    banFromRoom,
    fetchAccessRequests,
    approveAccessRequest,
    denyAccessRequest,
    logout,
  } = chat;

  // Apply the user's saved accent across the UI (components read var(--accent-color)).
  React.useEffect(() => {
    if (currentUser?.accentColor) {
      document.documentElement.style.setProperty('--accent-color', currentUser.accentColor);
    }
  }, [currentUser?.accentColor]);

  const [railMode, setRailMode] = React.useState(null);
  const [threadSourceId, setThreadSourceId] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [huddleOpen, setHuddleOpen] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [createRoomOpen, setCreateRoomOpen] = React.useState(false);
  const [accessReqOpen, setAccessReqOpen] = React.useState(false);
  const [adminUsersOpen, setAdminUsersOpen] = React.useState(false);
  const [globalSettingsOpen, setGlobalSettingsOpen] = React.useState(false);
  const isAdmin = currentUser?.role === 'admin';
  const isMod = isAdmin || currentUser?.role === 'moderator';

  // Auto-select a channel once data is loaded.
  React.useEffect(() => {
    if (!activeChannelId && channels.length) {
      const lobby = channels.find((c) => c.section === 'pinned') || channels[0];
      if (lobby) selectChannel(lobby.id);
    }
  }, [activeChannelId, channels, selectChannel]);

  // Cmd/Ctrl-K opens the palette; Esc closes overlays.
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setComposeOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const workspaces = [{ id: 'ws', name: 'Chat Server', short: 'CS', accent: 'var(--blue-500)' }];

  const members = activeChannel?.members || [];
  const onlineCount = members.reduce((n, id) => n + (usersById[id]?.presence === 'online' ? 1 : 0), 0);

  function toggleRail(mode) {
    setRailMode((m) => (m === mode ? null : mode));
  }

  function openThread(messageId) {
    setThreadSourceId(messageId);
    setRailMode('thread');
  }

  async function openDirectWith(userId) {
    const id = await startDirect(userId);
    if (id) selectChannel(id);
  }

  // Command palette items: existing channels/DMs, people to DM, and actions.
  const dmUserIds = new Set(channels.filter((c) => c.type === 'direct').map((c) => c.user));
  const paletteItems = [
    ...channels.map((c) => ({
      kind: c.type === 'direct' ? 'dm' : 'channel',
      id: c.id,
      label: c.type === 'direct' ? c.name : `#${c.name}`,
      hint: 'jump',
    })),
    ...Object.values(usersById)
      .filter((u) => u && u.id !== currentUser?.id && !dmUserIds.has(u.id))
      .map((u) => ({ kind: 'people', id: u.id, label: u.name, hint: 'DM' })),
    { kind: 'action', id: 'compose', label: 'Start a DM…', hint: 'action' },
    ...(isMod ? [{ kind: 'action', id: 'createroom', label: 'Create channel…', hint: 'action' }] : []),
    { kind: 'action', id: 'huddle', label: 'Start huddle', hint: 'action' },
  ];

  function onPaletteJump(item) {
    if (item.kind === 'channel' || item.kind === 'dm') selectChannel(item.id);
    else if (item.kind === 'people') openDirectWith(item.id);
    else if (item.id === 'compose') setComposeOpen(true);
    else if (item.id === 'createroom') setCreateRoomOpen(true);
    else if (item.id === 'huddle') setHuddleOpen(true);
  }

  const huddlePeople = [currentUser, ...members.map((id) => usersById[id]).filter(Boolean)]
    .filter(Boolean)
    .filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i);

  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 0, width: '100vw', background: 'var(--bg-app)', color: 'var(--fg-2)', overflow: 'hidden' }}>
      <WorkspaceRail
        workspaces={workspaces}
        active="ws"
        onSelect={() => {}}
        onActivity={() => setRailMode((m) => (m === 'activity' ? null : 'activity'))}
        onOpenSettings={() => setGlobalSettingsOpen(true)}
      />
      <ChannelList
        workspace={workspaces[0]}
        channels={channels}
        usersById={usersById}
        currentUser={currentUser}
        activeId={activeChannelId}
        onSelect={selectChannel}
        onCmdK={() => setPaletteOpen(true)}
        onComposeDm={() => setComposeOpen(true)}
        onSetPresence={setPresence}
        onLogout={logout}
        onSetAccent={setAccent}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateRoom={isMod ? () => setCreateRoomOpen(true) : undefined}
        onOpenAccessRequests={isAdmin ? () => setAccessReqOpen(true) : undefined}
        onOpenAdminUsers={isAdmin ? () => setAdminUsersOpen(true) : undefined}
        currentAccent={currentUser?.accentColor}
        isAdmin={isAdmin}
        approvalsCount={(approvals.incoming || []).filter((a) => a.status === 'pending').length}
        onQuick={(q) => setRailMode((m) => (m === q ? null : q))}
      />

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <DisconnectBanner connection={connection} />
        {activeChannel ? (
          <>
            <ChatHeader
              channel={activeChannel}
              memberCount={members.length}
              onlineCount={onlineCount}
              railMode={railMode}
              onToggleRail={toggleRail}
              onSearch={() => setPaletteOpen(true)}
              onMembers={() => toggleRail('members')}
              onPinned={() => toggleRail('pinned')}
              onHuddle={() => setHuddleOpen(true)}
            />
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <EmptyChannel channel={activeChannel} usersById={usersById} />
              </div>
            ) : (
              <MessageList
                channel={activeChannel}
                messages={messages}
                usersById={usersById}
                currentUserId={currentUser?.id}
                typing={typing}
                thinking={thinking}
                onOpenThread={openThread}
                onRespondApproval={respondApproval}
                density="comfortable"
              />
            )}
            <Composer channel={activeChannel} usersById={usersById} onSend={sendMessage} onTyping={sendTyping} />
          </>
        ) : (
          <EmptyChannel channel={null} usersById={usersById} />
        )}
      </section>

      <RightRail
        mode={railMode}
        channel={activeChannel}
        members={members}
        usersById={usersById}
        approvals={approvals}
        messages={messages}
        threadSourceId={threadSourceId}
        isMod={isMod}
        currentUserId={currentUser?.id}
        onRespondApproval={respondApproval}
        onThreadSend={(text) => sendMessage(text)}
        onSetVisibility={setRoomVisibility}
        fetchRoomRequests={fetchRoomRequests}
        onRespondRequest={respondRoomRequest}
        onBan={banFromRoom}
        onClose={() => setRailMode(null)}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} palette={paletteItems} onJump={onPaletteJump} />
      <HuddleFloater open={huddleOpen} onClose={() => setHuddleOpen(false)} channel={activeChannel} participants={huddlePeople} />
      <ComposeDm
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        searchUsers={searchUsers}
        currentUserId={currentUser?.id}
        onPicked={openDirectWith}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={currentUser}
        updateProfile={updateProfile}
        uploadImage={uploadImage}
        changePassword={changePassword}
        setAccent={setAccent}
      />
      <CreateRoom
        open={createRoomOpen}
        onClose={() => setCreateRoomOpen(false)}
        onCreate={async (title, isPublic) => {
          const id = await createRoom(title, isPublic);
          if (id) selectChannel(id);
          return id;
        }}
      />
      <AccessRequests
        open={accessReqOpen}
        onClose={() => setAccessReqOpen(false)}
        fetchAccessRequests={fetchAccessRequests}
        onApprove={approveAccessRequest}
        onDeny={denyAccessRequest}
      />
      <AdminUsers open={adminUsersOpen} onClose={() => setAdminUsersOpen(false)} currentUserId={currentUser?.id} />
      <GlobalSettings open={globalSettingsOpen} onClose={() => setGlobalSettingsOpen(false)} />
    </div>
  );
}

function Root() {
  const chat = useChat();
  if (!chat.token) return <Login />;
  if (chat.bootError)
    return (
      <CenterNote>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: 'var(--urgent-300)' }}>Could not load: {chat.bootError}</div>
          <Button variant="ghost" onClick={chat.logout} style={{ alignSelf: 'center' }}>
            Sign out
          </Button>
        </div>
      </CenterNote>
    );
  if (!chat.ready) return <CenterNote>Loading…</CenterNote>;
  return <Shell />;
}

export default function App() {
  return (
    <ChatProvider>
      <Root />
    </ChatProvider>
  );
}
