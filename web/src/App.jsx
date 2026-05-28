import React from 'react';
import { ChatProvider, useChat } from './data/store.jsx';
import Login from './Login.jsx';
import { WorkspaceRail, ChannelList } from './sidebar/Sidebar.jsx';
import { ChatHeader } from './main/ChatHeader.jsx';
import { Composer } from './main/Composer.jsx';
import { MessageList } from './main/messages.jsx';
import { RightRail } from './rail/RightRail.jsx';
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
    respondApproval,
    logout,
  } = chat;

  const [railMode, setRailMode] = React.useState(null);

  // Auto-select a channel once data is loaded.
  React.useEffect(() => {
    if (!activeChannelId && channels.length) {
      const lobby = channels.find((c) => c.section === 'pinned') || channels[0];
      if (lobby) selectChannel(lobby.id);
    }
  }, [activeChannelId, channels, selectChannel]);

  const workspaces = [{ id: 'ws', name: 'Chat Server', short: 'CS', accent: 'var(--blue-500)' }];

  const members = activeChannel?.members || [];
  const onlineCount = members.reduce((n, id) => n + (usersById[id]?.presence === 'online' ? 1 : 0), 0);

  function toggleRail(mode) {
    setRailMode((m) => (m === mode ? null : mode));
  }

  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 0, width: '100vw', background: 'var(--bg-app)', color: 'var(--fg-2)', overflow: 'hidden' }}>
      <WorkspaceRail workspaces={workspaces} active="ws" onSelect={() => {}} />
      <ChannelList
        workspace={workspaces[0]}
        channels={channels}
        usersById={usersById}
        currentUser={currentUser}
        activeId={activeChannelId}
        onSelect={selectChannel}
        onCmdK={() => {}}
        onComposeDm={() => {}}
        onSetPresence={setPresence}
        onLogout={logout}
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
              onSearch={() => {}}
              onMembers={() => toggleRail('members')}
              onPinned={() => toggleRail('pinned')}
              onHuddle={() => {}}
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
                typing={typing}
                thinking={thinking}
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
        onRespondApproval={respondApproval}
        onClose={() => setRailMode(null)}
      />
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
