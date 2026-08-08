import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import NotificationBell from './NotificationBell';
import birdsOfPreyLogo from '../assets/portals/birds-of-prey-logo.png.png';

const navItems = [
  { label: 'Dashboard', view: 'dashboard' },
  { label: 'Athletes', view: 'athletes' },
  { label: 'Contracts', view: 'contracts' },
  { label: 'Gear', view: 'gear' },
  { label: 'Gear Assignments', view: 'gear assignments' },
  { label: 'Gear Requests', view: 'gear requests' },
  { label: 'Trips', view: 'trips' },
  { label: 'eSIM Requests', view: 'esim requests' },
  { label: 'Content', view: 'content' },
  { label: 'Events', view: 'events' },
  { label: 'Announcements', view: 'announcements' },
];

type AppNavProps = {
  view: string;
  setView: (v: string) => void;
  athleteId?: string;
  onSwitchPortal?: () => void;
  onSignOut?: () => void;
};

export default function AppNav({ view, setView, athleteId, onSwitchPortal, onSignOut }: AppNavProps) {
  const ACCENT_ORANGE = '#c9782d';
  const ACCENT_ORANGE_DIM = '#ab621f';

  const navButtonSx = {
    my: 0.3,
    px: 1.3,
    py: 0.7,
    minHeight: 34,
    borderRadius: 1.8,
    textTransform: 'none',
    fontSize: 13,
    fontWeight: 620,
    letterSpacing: 0.15,
    whiteSpace: 'nowrap',
    color: '#cbcbcf',
    border: '1px solid transparent',
    '&:hover': {
      color: '#f0f0f2',
      bgcolor: '#1c1c1f',
      borderColor: '#2d2d32',
    },
    '&:focus-visible': {
      outline: `2px solid ${ACCENT_ORANGE}`,
      outlineOffset: 2,
    },
  };

  return (
    <AppBar
      position="static"
      sx={{
        bgcolor: '#111214',
        color: '#f0f0f2',
        borderBottom: '1px solid #252529',
        boxShadow: 'none',
      }}
    >
      <Toolbar sx={{ px: { xs: 1.5, sm: 2.5, md: 3 }, py: 1.2, alignItems: 'stretch' }}>
        <Box sx={{ width: '100%', display: 'grid', gap: 1.1 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: 'auto 1fr auto' },
              alignItems: 'center',
              gap: 1.25,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, minWidth: 0 }}>
              <Box
                component="img"
                src={birdsOfPreyLogo}
                alt="Birds of Prey logo"
                sx={{
                  height: { xs: 28, sm: 30 },
                  width: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: { xs: 14, sm: 15 }, fontWeight: 700, letterSpacing: 0.2, color: '#ececee', lineHeight: 1.2 }}>
                  Birds of Prey Portal
                </Typography>
                <Typography sx={{ mt: 0.15, fontSize: 11.5, color: '#909097', letterSpacing: 0.45, textTransform: 'uppercase' }}>
                  Athlete Operations
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: { xs: 'none', xl: 'block' } }} />

            <Box
              sx={{
                justifySelf: { xs: 'stretch', xl: 'end' },
                display: 'flex',
                alignItems: 'center',
                justifyContent: { xs: 'space-between', xl: 'flex-end' },
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              {athleteId && <NotificationBell athleteId={athleteId} />}
              {onSwitchPortal ? (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onSwitchPortal}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 1.7,
                    fontWeight: 620,
                    borderColor: '#44444a',
                    color: '#e2e2e4',
                    bgcolor: '#151518',
                    '&:hover': { borderColor: '#5a5a61', bgcolor: '#1d1d21' },
                    '&:focus-visible': {
                      outline: `2px solid ${ACCENT_ORANGE}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  Switch Portal
                </Button>
              ) : null}
              {onSignOut ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={onSignOut}
                  sx={{
                    textTransform: 'none',
                    borderRadius: 1.7,
                    fontWeight: 680,
                    bgcolor: ACCENT_ORANGE,
                    color: '#1a1209',
                    '&:hover': { bgcolor: ACCENT_ORANGE_DIM },
                    '&:focus-visible': {
                      outline: `2px solid ${ACCENT_ORANGE}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  Sign Out
                </Button>
              ) : null}
            </Box>
          </Box>

          <Box
            component="nav"
            aria-label="Portal modules"
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 0.55,
              px: 0.2,
              pt: 0.2,
            }}
          >
            {navItems.map((item) => {
              const isActive = view === item.view;
              return (
                <Button
                  key={item.view}
                  onClick={() => setView(item.view)}
                  aria-current={isActive ? 'page' : undefined}
                  sx={{
                    ...navButtonSx,
                    color: isActive ? '#f4f4f6' : navButtonSx.color,
                    bgcolor: isActive ? '#231a12' : 'transparent',
                    borderColor: isActive ? '#4e3520' : 'transparent',
                    '&:hover': {
                      color: '#f0f0f2',
                      bgcolor: isActive ? '#2b1f16' : '#1c1c1f',
                      borderColor: isActive ? '#5c3f26' : '#2d2d32',
                    },
                    '&::after': isActive
                      ? {
                        content: '""',
                        position: 'absolute',
                        left: 10,
                        right: 10,
                        bottom: 4,
                        borderBottom: `2px solid ${ACCENT_ORANGE}`,
                        borderRadius: 2,
                      }
                      : undefined,
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
