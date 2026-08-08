import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import birdsOfPreyLogo from '../assets/portals/display/birds-of-prey-logo-display.png';
import mwdEmployeeLogo from '../assets/portals/display/mwd-employee-logo-display.png';

type PortalSelectionProps = {
  onOpenBirdsOfPrey: () => void;
  onOpenEmployeePortal: () => void;
  onSignOut: () => void;
};

function PortalLogo({ src, alt, logoScale = 1 }: { src: string; alt: string; logoScale?: number }) {
  return (
    <Box
      sx={{
        width: 148,
        height: 104,
        borderRadius: 2,
        border: '1px solid #373737',
        bgcolor: '#141414',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 1.25,
        overflow: 'hidden',
      }}
    >
      <Box
        component="img"
        src={src}
        alt={alt}
        sx={{
          width: `${Math.round(100 * logoScale)}%`,
          height: `${Math.round(100 * logoScale)}%`,
          objectFit: 'contain',
          objectPosition: 'center',
          display: 'block',
        }}
      />
    </Box>
  );
}

function PortalCard({
  title,
  subtitle,
  logo,
  actionLabel,
  onAction,
  badge,
}: {
  title: string;
  subtitle: string;
  logo: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  badge?: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        maxWidth: 440,
        minHeight: 296,
        p: 3,
        borderRadius: 3,
        border: '1px solid #3a3a3a',
        bgcolor: '#222',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: '#5f5f5f',
          boxShadow: '0 14px 28px rgba(0,0,0,0.35)',
        },
      }}
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2.5 }}>
          {logo}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 0.75 }}>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.15 }}>
            {title}
          </Typography>
          {badge ? <Chip size="small" color="warning" label={badge} /> : null}
        </Box>
        <Typography variant="body1" sx={{ color: '#bdbdbd' }}>
          {subtitle}
        </Typography>
      </Box>

      <Button
        variant="contained"
        color="error"
        onClick={onAction}
        sx={{ mt: 3, fontWeight: 700, borderRadius: 2 }}
      >
        {actionLabel}
      </Button>
    </Paper>
  );
}

const PortalSelection: React.FC<PortalSelectionProps> = ({
  onOpenBirdsOfPrey,
  onOpenEmployeePortal,
  onSignOut,
}) => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#181818',
        color: '#fff',
        px: { xs: 2, sm: 3 },
        py: { xs: 2.5, sm: 3.5 },
      }}
    >
      <Box
        sx={{
          maxWidth: 1040,
          mx: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: { xs: 2.25, sm: 2.75 },
        }}
      >
        <Typography sx={{ color: '#9e9e9e', letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 12 }}>
          MWD Platform
        </Typography>
        <Button variant="outlined" color="inherit" onClick={onSignOut} sx={{ borderRadius: 2 }}>
          Sign Out
        </Button>
      </Box>

      <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 4 } }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, letterSpacing: 0.2 }}>
          Choose a Portal
        </Typography>
        <Typography sx={{ color: '#bdbdbd', maxWidth: 520, mx: 'auto' }}>
          One secure MWD login. Two internal workspaces.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
          justifyItems: 'center',
          alignItems: 'stretch',
          maxWidth: 1040,
          mx: 'auto',
        }}
      >
        <PortalCard
          title="Birds of Prey Portal"
          subtitle="Athlete Operations"
          logo={<PortalLogo src={birdsOfPreyLogo} alt="Birds of Prey portal logo" logoScale={0.78} />}
          actionLabel="Open Portal"
          onAction={onOpenBirdsOfPrey}
        />

        <PortalCard
          title="MWD Employee Portal"
          subtitle="Internal Operations"
          logo={<PortalLogo src={mwdEmployeeLogo} alt="MWD Employee portal logo" logoScale={0.9} />}
          actionLabel="Open Portal"
          onAction={onOpenEmployeePortal}
          badge="Coming Soon"
        />
      </Box>
    </Box>
  );
};

export default PortalSelection;
