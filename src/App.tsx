
import React, { useEffect, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Fade from '@mui/material/Fade';
import Stack from '@mui/material/Stack';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import ResetPassword from './components/ResetPassword';
import Dashboard from './components/Dashboard';
import PortalSelection from './components/PortalSelection';
import EmployeePortalPlaceholder from './components/EmployeePortalPlaceholder';

const theme = createTheme({
  palette: {
    mode: 'dark',
    // You can customize colors here
  },
});

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<'selector' | 'birds_of_prey' | 'mwd_employee'>('selector');

  useEffect(() => {
    // Detect recovery mode on initial load
    if (window.location.hash.includes('type=recovery')) {
      setRecoveryMode(true);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data?.session);
      setAuthResolved(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
      setSession(session);
      if (!session) {
        setSelectedPortal('selector');
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSelectedPortal('selector');
  }

  // Always show ResetPassword if recoveryMode is true
  if (recoveryMode) {
    return (
      <ThemeProvider theme={theme}>
        <ResetPassword onComplete={() => setRecoveryMode(false)} />
      </ThemeProvider>
    );
  }

  if (!authResolved) {
    return (
      <ThemeProvider theme={theme}>
        <Box
          sx={{
            minHeight: '100vh',
            bgcolor: '#181818',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <CircularProgress color="error" />
            <Box sx={{ color: '#bdbdbd' }}>Resolving session...</Box>
          </Stack>
        </Box>
      </ThemeProvider>
    );
  }

  if (!session) {
    return (
      <ThemeProvider theme={theme}>
        <Fade in timeout={240}>
          <Box>
            <Auth onAuth={() => supabase.auth.getSession().then(({ data }) => setSession(data?.session))} />
          </Box>
        </Fade>
      </ThemeProvider>
    );
  }

  if (selectedPortal === 'selector') {
    return (
      <ThemeProvider theme={theme}>
        <Fade in timeout={260}>
          <Box>
            <PortalSelection
              onOpenBirdsOfPrey={() => setSelectedPortal('birds_of_prey')}
              onOpenEmployeePortal={() => setSelectedPortal('mwd_employee')}
              onSignOut={() => void handleSignOut()}
            />
          </Box>
        </Fade>
      </ThemeProvider>
    );
  }

  if (selectedPortal === 'mwd_employee') {
    return (
      <ThemeProvider theme={theme}>
        <Fade in timeout={220}>
          <Box>
            <EmployeePortalPlaceholder
              onBackToPortalSelection={() => setSelectedPortal('selector')}
              onSignOut={() => void handleSignOut()}
            />
          </Box>
        </Fade>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Fade in timeout={220}>
        <Box>
          <Dashboard
            onSwitchPortal={() => setSelectedPortal('selector')}
            onSignOut={() => void handleSignOut()}
          />
        </Box>
      </Fade>
    </ThemeProvider>
  );
};

export default App;
