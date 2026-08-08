import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

type EmployeePortalPlaceholderProps = {
  onBackToPortalSelection: () => void;
  onSignOut: () => void;
};

const EmployeePortalPlaceholder: React.FC<EmployeePortalPlaceholderProps> = ({
  onBackToPortalSelection,
  onSignOut,
}) => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#181818',
        display: 'grid',
        placeItems: 'center',
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 640,
          p: 4,
          borderRadius: 3,
          border: '1px solid #3a3a3a',
          bgcolor: '#232323',
          color: '#fff',
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1.5 }}>
          MWD Employee Portal
        </Typography>
        <Typography variant="h6" sx={{ color: '#ffb74d', fontWeight: 700, mb: 2 }}>
          Coming Soon
        </Typography>
        <Typography sx={{ color: '#bdbdbd', mb: 3 }}>
          This portal is currently under development.
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="outlined" color="inherit" onClick={onBackToPortalSelection}>
            Back to Portal Selection
          </Button>
          <Button variant="contained" color="error" onClick={onSignOut}>
            Sign Out
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default EmployeePortalPlaceholder;
