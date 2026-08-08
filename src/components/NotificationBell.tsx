import React, { useEffect, useState } from 'react';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { fetchNotifications, markNotificationRead } from '../modules/notifications/notificationsApi';
import { supabase } from '../supabaseClient';

interface NotificationBellProps {
  athleteId: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ athleteId }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (athleteId) {
      fetchNotifications(athleteId).then((data: any[]) => {
        setNotifications(data);
        setUnreadCount(data.filter((n: any) => !n.read).length);
      });
    }
  }, [athleteId]);

  const handleMarkAllRead = async () => {
    if (!athleteId) return;
    await supabase.from('notifications').update({ read: true }).eq('athlete_id', athleteId);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleClearAll = async () => {
    if (!athleteId) return;
    await supabase.from('notifications').delete().eq('athlete_id', athleteId);
    setNotifications([]);
    setUnreadCount(0);
  };

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  // Count unread reminders for badge
  const unreadReminders = notifications.filter((n) => !n.read && n.type === 'reminder').length;

  return (
    <>
      <IconButton color="inherit" onClick={handleOpen} size="large">
        <Badge badgeContent={unreadReminders > 0 ? unreadReminders : unreadCount} color={unreadReminders > 0 ? 'warning' : 'error'}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        {notifications.length === 0 ? (
          <MenuItem disabled><Typography>No notifications</Typography></MenuItem>
        ) : (
          <>
            <MenuItem onClick={handleMarkAllRead} disabled={unreadCount === 0} sx={{ fontWeight: 600, color: '#43a047' }}>
              Mark all as read
            </MenuItem>
            <MenuItem onClick={handleClearAll} sx={{ fontWeight: 600, color: '#e53935' }}>
              Clear all
            </MenuItem>
            <hr style={{ width: '100%', margin: '4px 0', border: 0, borderTop: '1px solid #444' }} />
            {notifications.map((n) => (
              <MenuItem key={n.id} onClick={() => handleMarkRead(n.id)} selected={!n.read}>
                <Typography
                  variant="body2"
                  color={n.read ? 'textSecondary' : n.type === 'reminder' ? 'warning.main' : 'primary'}
                  sx={n.type === 'reminder' ? { fontWeight: 700 } : {}}
                >
                  {n.type === 'reminder' && '⏰ '}
                  {n.message}
                </Typography>
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </>
  );
};

export default NotificationBell;
