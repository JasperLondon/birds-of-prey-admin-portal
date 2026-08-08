import * as React from 'react';
import Athletes from './Athletes';
import Contracts from './Contracts';
import AppNav from './AppNav';
import { supabase } from '../supabaseClient';
import GearItems from './GearItems';
import GearAssignments from './GearAssignments';
import Trips from './Trips';
import EsimRequests from './EsimRequests';
import Content from './Content';
import CalendarGrid from './CalendarGrid';
import AdminGearRequestsTable from './AdminGearRequestsTable';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';

const modules = [
  { title: 'Athletes', description: 'Manage athlete profiles and status' },
  { title: 'Contracts', description: 'Track documents and response actions' },
  { title: 'Gear', description: 'Monitor inventory and equipment posture' },
  { title: 'Gear Assignments', description: 'Confirm equipment assignment coverage' },
  { title: 'Gear Requests', description: 'Review pending request decisions' },
  { title: 'Trips', description: 'Check operation readiness by trip' },
  { title: 'eSIM Requests', description: 'Review request and provisioning state' },
  { title: 'Content', description: 'Monitor blocked and due content work' },
  { title: 'Events', description: 'Track upcoming operation timeline' },
  { title: 'Announcements', description: 'Manage operational communications' },
];

type OpsBriefState = {
  esimRequested: number | null;
  esimUnderReview: number | null;
  esimApproved: number | null;
  gearRequestsPending: number | null;
  contractsExpired: number | null;
  activeAthletes: number | null;
  activeTrips: number | null;
  plannedTrips: number | null;
  upcomingEvents: number | null;
  invitationSent: number | null;
};

type NextOperation = {
  id: string;
  title: string | null;
  status: string | null;
  location: string | null;
  startsAt: string | null;
} | null;

type OpsMetricStatus = {
  esimRequested: string | null;
  esimUnderReview: string | null;
  esimApproved: string | null;
  gearRequestsPending: string | null;
  contractsExpired: string | null;
  activeAthletes: string | null;
  activeTrips: string | null;
  plannedTrips: string | null;
  upcomingEvents: string | null;
  invitationSent: string | null;
  nextOperation: string | null;
};

type DashboardProps = {
  onSwitchPortal?: () => void;
  onSignOut?: () => void;
};

const ACCENT_ORANGE = '#c9782d';
const ACCENT_ORANGE_DIM = '#ab621f';
const SUCCESS_GREEN = '#5f8f62';
const DANGER_RED = '#d25757';

const Dashboard: React.FC<DashboardProps> = ({ onSwitchPortal, onSignOut }) => {
  const [view, setView] = React.useState('dashboard');
  const [athleteId, setAthleteId] = React.useState<string | undefined>(undefined);
  const [onboardRequestKey, setOnboardRequestKey] = React.useState(0);
  const [opsLoading, setOpsLoading] = React.useState(false);
  const [opsError, setOpsError] = React.useState('');

  const [opsBrief, setOpsBrief] = React.useState<OpsBriefState>({
    esimRequested: null,
    esimUnderReview: null,
    esimApproved: null,
    gearRequestsPending: null,
    contractsExpired: null,
    activeAthletes: null,
    activeTrips: null,
    plannedTrips: null,
    upcomingEvents: null,
    invitationSent: null,
  });

  const [nextOperation, setNextOperation] = React.useState<NextOperation>(null);
  const [metricStatus, setMetricStatus] = React.useState<OpsMetricStatus>({
    esimRequested: null,
    esimUnderReview: null,
    esimApproved: null,
    gearRequestsPending: null,
    contractsExpired: null,
    activeAthletes: null,
    activeTrips: null,
    plannedTrips: null,
    upcomingEvents: null,
    invitationSent: null,
    nextOperation: null,
  });

  React.useEffect(() => {
    async function getUser() {
      const { data } = await supabase.auth.getUser();
      if (data && data.user) setAthleteId(data.user.id);
    }
    void getUser();
  }, []);

  React.useEffect(() => {
    if (view !== 'dashboard') return;

    let isMounted = true;

    async function loadOpsBrief() {
      setOpsLoading(true);
      setOpsError('');

      const [
        esimRequestedResult,
        esimUnderReviewResult,
        esimApprovedResult,
        gearPendingResult,
        contractsExpiredResult,
        activeAthletesResult,
        activeTripsResult,
        plannedTripsResult,
        eventsResult,
        onboardingStateResult,
      ] = await Promise.all([
        supabase.from('esim_requests').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
        supabase.from('esim_requests').select('id', { count: 'exact', head: true }).eq('status', 'under_review'),
        supabase.from('esim_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('gear_requests').select('id', { count: 'exact', head: true }).or('status.is.null,status.eq.pending'),
        supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'expired'),
        supabase.from('athletes').select('id', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('trips').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('trips').select('id', { count: 'exact', head: true }).eq('status', 'planned'),
        supabase.from('events').select('id, title, location, start_time, start_date, event_date'),
        supabase.rpc('admin_get_athlete_onboarding_states'),
      ]);

      let normalizedNextEventError: string | null = null;
      let normalizedNextOperation: NextOperation = null;
      let upcomingEventsCount = 0;

      if (eventsResult.error) {
        normalizedNextEventError = eventsResult.error.message || 'Failed to load events.';
      } else {
        const rows = (eventsResult.data || []) as any[];
        const now = new Date();

        const toValidDate = (value: string | null | undefined) => {
          if (!value) return null;
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const normalizedUpcoming = rows
          .map((row) => {
            const startsAtRaw = row.start_time || row.start_date || row.event_date || null;
            const startsAtDate = toValidDate(startsAtRaw);
            return {
              id: row.id as string,
              title: (row.title as string | null) || null,
              location: (row.location as string | null) || null,
              startsAtRaw,
              startsAtDate,
            };
          })
          .filter((row) => row.startsAtDate && row.startsAtDate.getTime() >= now.getTime())
          .sort((a, b) => a.startsAtDate!.getTime() - b.startsAtDate!.getTime());

        upcomingEventsCount = normalizedUpcoming.length;

        if (normalizedUpcoming[0]) {
          normalizedNextOperation = {
            id: normalizedUpcoming[0].id,
            title: normalizedUpcoming[0].title,
            status: null,
            location: normalizedUpcoming[0].location,
            startsAt: normalizedUpcoming[0].startsAtRaw,
          };
        }
      }

      if (!isMounted) return;

      const onboardingRows = Array.isArray(onboardingStateResult.data) ? onboardingStateResult.data : [];
      const invitationSent = onboardingRows.filter((row: any) => row?.invitation_status === 'Invitation Sent').length;

      const nextBrief: OpsBriefState = {
        esimRequested: esimRequestedResult.error ? null : (esimRequestedResult.count ?? 0),
        esimUnderReview: esimUnderReviewResult.error ? null : (esimUnderReviewResult.count ?? 0),
        esimApproved: esimApprovedResult.error ? null : (esimApprovedResult.count ?? 0),
        gearRequestsPending: gearPendingResult.error ? null : (gearPendingResult.count ?? 0),
        contractsExpired: contractsExpiredResult.error ? null : (contractsExpiredResult.count ?? 0),
        activeAthletes: activeAthletesResult.error ? null : (activeAthletesResult.count ?? 0),
        activeTrips: activeTripsResult.error ? null : (activeTripsResult.count ?? 0),
        plannedTrips: plannedTripsResult.error ? null : (plannedTripsResult.count ?? 0),
        upcomingEvents: eventsResult.error ? null : upcomingEventsCount,
        invitationSent: onboardingStateResult.error ? null : invitationSent,
      };

      const nextStatus: OpsMetricStatus = {
        esimRequested: esimRequestedResult.error?.message || null,
        esimUnderReview: esimUnderReviewResult.error?.message || null,
        esimApproved: esimApprovedResult.error?.message || null,
        gearRequestsPending: gearPendingResult.error?.message || null,
        contractsExpired: contractsExpiredResult.error?.message || null,
        activeAthletes: activeAthletesResult.error?.message || null,
        activeTrips: activeTripsResult.error?.message || null,
        plannedTrips: plannedTripsResult.error?.message || null,
        upcomingEvents: eventsResult.error?.message || null,
        invitationSent: onboardingStateResult.error?.message || null,
        nextOperation: normalizedNextEventError,
      };

      const availableCount = Object.values(nextBrief).filter((value) => value !== null).length;
      if (availableCount === 0 && normalizedNextEventError) {
        setOpsError('Operations Brief is temporarily unavailable.');
      }

      setMetricStatus(nextStatus);
      setOpsBrief(nextBrief);
      setNextOperation(normalizedNextOperation);
      setOpsLoading(false);
    }

    void loadOpsBrief();

    return () => {
      isMounted = false;
    };
  }, [view]);

  const nowLabel = React.useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  }, []);

  const formatDate = React.useCallback((value: string | null) => {
    if (!value) return 'No upcoming operation is scheduled.';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString();
  }, []);

  const metricValue = React.useCallback((value: number | null) => {
    if (value === null) return 'Unavailable';
    return `${value}`;
  }, []);

  const handleOnboardRequestHandled = React.useCallback(() => {
    setOnboardRequestKey(0);
  }, []);

  const attentionTotal = [
    opsBrief.esimRequested,
    opsBrief.esimUnderReview,
    opsBrief.gearRequestsPending,
    opsBrief.contractsExpired,
  ].reduce((sum: number, value) => sum + (value ?? 0), 0);

  const hasAttentionData = [
    opsBrief.esimRequested,
    opsBrief.esimUnderReview,
    opsBrief.gearRequestsPending,
    opsBrief.contractsExpired,
  ].some((value) => value !== null);

  return (
    <Box sx={{ bgcolor: '#0d0d0e', minHeight: '100vh', p: 0 }}>
      <AppNav
        view={view}
        setView={setView}
        athleteId={athleteId}
        onSwitchPortal={onSwitchPortal}
        onSignOut={onSignOut}
      />

      {view === 'dashboard' && (
        <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: { xs: 3, sm: 4 } }}>
          <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
            <Box
              sx={{
                mb: 3,
                p: { xs: 2.25, sm: 2.75 },
                borderRadius: 3,
                border: '1px solid #2a2a2d',
                bgcolor: '#151517',
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                alignItems: { xs: 'flex-start', md: 'center' },
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box>
                <Typography sx={{ color: '#8e8e92', fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase', mb: 0.75 }}>
                  MWD Command & Control
                </Typography>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 720, letterSpacing: 0.1, mb: 0.5 }}>
                  Operations Brief
                </Typography>
                <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
                  A clear view of readiness, priorities and upcoming operations.
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'space-between', md: 'flex-end' } }}>
                <Typography sx={{ color: '#909095', fontSize: 13 }}>
                  {nowLabel}
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => {
                    setView('athletes');
                    setOnboardRequestKey((k) => k + 1);
                  }}
                  sx={{
                    fontWeight: 700,
                    textTransform: 'none',
                    borderRadius: 2,
                    px: 2,
                    bgcolor: ACCENT_ORANGE,
                    '&:hover': { bgcolor: ACCENT_ORANGE_DIM },
                  }}
                >
                  Onboard New Athlete
                </Button>
              </Box>
            </Box>

            {opsError ? (
              <Box sx={{ mb: 2.25, p: 1.5, borderRadius: 2, border: `1px solid ${DANGER_RED}`, bgcolor: '#2a1818' }}>
                <Typography sx={{ color: '#f2c0c0', fontSize: 14 }}>{opsError}</Typography>
              </Box>
            ) : null}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr 1fr' },
                gap: 2,
                mb: 2,
              }}
            >
              <Card
                sx={{
                  bgcolor: '#161618',
                  color: '#fff',
                  borderRadius: 3,
                  border: `1px solid ${attentionTotal > 0 ? '#514436' : '#2a2a2d'}`,
                  minHeight: 240,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2.25 }}>
                  <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
                    Priority
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 690, mb: 0.75 }}>
                    What Needs Attention
                  </Typography>

                  {opsLoading ? (
                    <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                      <CircularProgress size={24} sx={{ color: ACCENT_ORANGE }} />
                    </Box>
                  ) : (
                    <>
                      {hasAttentionData && attentionTotal === 0 ? (
                        <Typography sx={{ color: '#a9b9a9', mb: 1.5 }}>No immediate operational blockers.</Typography>
                      ) : null}

                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                        {[
                          { label: 'eSIM Requested', value: opsBrief.esimRequested, route: 'esim requests', status: metricStatus.esimRequested },
                          { label: 'eSIM Under Review', value: opsBrief.esimUnderReview, route: 'esim requests', status: metricStatus.esimUnderReview },
                          { label: 'Gear Requests Pending', value: opsBrief.gearRequestsPending, route: 'gear requests', status: metricStatus.gearRequestsPending },
                          { label: 'Expired Contracts', value: opsBrief.contractsExpired, route: 'contracts', status: metricStatus.contractsExpired },
                        ].map((metric) => (
                          <Box key={metric.label} sx={{ p: 1.1, borderRadius: 2, border: '1px solid #252528', bgcolor: '#131315' }}>
                            <Typography sx={{ color: '#9b9ba0', fontSize: 12.5 }}>{metric.label}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mt: 0.4 }}>
                              <Typography sx={{ fontSize: 26, fontWeight: 710, color: metric.value === null ? '#727277' : '#f6f6f7' }}>
                                {metricValue(metric.value)}
                              </Typography>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => setView(metric.route)}
                                sx={{ minWidth: 0, px: 0.5, color: ACCENT_ORANGE, textTransform: 'none', fontSize: 12.5 }}
                              >
                                Open
                              </Button>
                            </Box>
                            {metric.status ? (
                              <Typography sx={{ color: '#8a8a8f', fontSize: 11.5, mt: 0.2 }}>Unavailable</Typography>
                            ) : null}
                          </Box>
                        ))}
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card
                sx={{
                  bgcolor: '#161618',
                  color: '#fff',
                  borderRadius: 3,
                  border: '1px solid #2a2a2d',
                  minHeight: 240,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2.25 }}>
                  <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
                    Readiness
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 670, mb: 1.2 }}>
                    Operational Readiness
                  </Typography>

                  {[
                    { label: 'Active Athletes', value: opsBrief.activeAthletes, route: 'athletes', status: metricStatus.activeAthletes },
                    { label: 'Active Trips', value: opsBrief.activeTrips, route: 'trips', status: metricStatus.activeTrips },
                    { label: 'eSIM Approved', value: opsBrief.esimApproved, route: 'esim requests', status: metricStatus.esimApproved },
                  ].map((metric) => (
                    <Box key={metric.label} sx={{ mb: 1.1 }}>
                      <Typography sx={{ color: '#a0a0a5', fontSize: 12.5 }}>{metric.label}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mt: 0.2 }}>
                        <Typography sx={{ fontSize: 23, fontWeight: 700, color: metric.value === null ? '#6d6d72' : SUCCESS_GREEN }}>
                          {metricValue(metric.value)}
                        </Typography>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setView(metric.route)}
                          sx={{ minWidth: 0, px: 0.5, color: '#9f9fa5', textTransform: 'none', fontSize: 12.5 }}
                        >
                          Open
                        </Button>
                      </Box>
                      {metric.status ? <Typography sx={{ color: '#8a8a8f', fontSize: 11.5 }}>Unavailable</Typography> : null}
                    </Box>
                  ))}
                </CardContent>
              </Card>

              <Card
                sx={{
                  bgcolor: '#161618',
                  color: '#fff',
                  borderRadius: 3,
                  border: '1px solid #2a2a2d',
                  minHeight: 240,
                  boxShadow: 'none',
                }}
              >
                <CardContent sx={{ p: 2.25 }}>
                  <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
                    Next
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 670, mb: 1.2 }}>
                    Coming Next
                  </Typography>

                  {[
                    { label: 'Upcoming Events', value: opsBrief.upcomingEvents, route: 'events', status: metricStatus.upcomingEvents },
                    { label: 'Planned Trips', value: opsBrief.plannedTrips, route: 'trips', status: metricStatus.plannedTrips },
                    { label: 'Invitations Sent', value: opsBrief.invitationSent, route: 'athletes', status: metricStatus.invitationSent },
                  ].map((metric) => (
                    <Box key={metric.label} sx={{ mb: 1.1 }}>
                      <Typography sx={{ color: '#a0a0a5', fontSize: 12.5 }}>{metric.label}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mt: 0.2 }}>
                        <Typography sx={{ fontSize: 23, fontWeight: 690, color: metric.value === null ? '#6d6d72' : '#d6d6d9' }}>
                          {metricValue(metric.value)}
                        </Typography>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setView(metric.route)}
                          sx={{ minWidth: 0, px: 0.5, color: '#9f9fa5', textTransform: 'none', fontSize: 12.5 }}
                        >
                          Open
                        </Button>
                      </Box>
                      {metric.status ? <Typography sx={{ color: '#8a8a8f', fontSize: 11.5 }}>Unavailable</Typography> : null}
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </Box>

            <Card
              sx={{
                bgcolor: '#151517',
                color: '#fff',
                borderRadius: 3,
                border: '1px solid #2b2b2e',
                boxShadow: 'none',
                mb: 2.25,
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
                  Next Operation
                </Typography>

                {metricStatus.nextOperation ? (
                  <Typography sx={{ color: '#8f8f94', fontSize: 14 }}>
                    Next operation details are temporarily unavailable.
                  </Typography>
                ) : nextOperation ? (
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between', gap: 1.5 }}>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 680, mb: 0.35 }}>
                        {nextOperation.title || 'Upcoming Operation'}
                      </Typography>
                      <Typography sx={{ color: '#b0b0b4', fontSize: 14 }}>
                        {formatDate(nextOperation.startsAt)}
                      </Typography>
                      <Typography sx={{ color: '#8f8f94', fontSize: 13.5, mt: 0.35 }}>
                        {nextOperation.location || 'Location not specified'} · {nextOperation.status || 'Status unknown'}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      onClick={() => setView('events')}
                      sx={{
                        textTransform: 'none',
                        borderColor: '#4f4f54',
                        color: '#d6d6da',
                        '&:hover': { borderColor: ACCENT_ORANGE, color: ACCENT_ORANGE },
                      }}
                    >
                      Open Events
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ color: '#a4b3a4' }}>
                      No upcoming operation is scheduled.
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => setView('events')}
                      sx={{
                        textTransform: 'none',
                        borderColor: '#4f4f54',
                        color: '#d6d6da',
                        '&:hover': { borderColor: ACCENT_ORANGE, color: ACCENT_ORANGE },
                      }}
                    >
                      Open Events
                    </Button>
                  </Box>
                )}
              </CardContent>
            </Card>

            <Box sx={{ mb: 1.35 }}>
              <Typography variant="h6" sx={{ color: '#f3f3f4', fontWeight: 660, mb: 0.25 }}>
                Workspace Modules
              </Typography>
              <Typography variant="body2" sx={{ color: '#9d9da1' }}>
                Secondary workspace access after reviewing operational state.
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
                gap: 1.3,
              }}
            >
              {modules.map((mod) => (
                <Card
                  key={mod.title}
                  sx={{
                    bgcolor: '#141416',
                    color: '#fff',
                    borderRadius: 2.25,
                    border: '1px solid #27272a',
                    boxShadow: 'none',
                  }}
                >
                  <CardActionArea
                    onClick={() => setView(mod.title.toLowerCase())}
                    sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Box sx={{ minWidth: 0, pr: 1 }}>
                      <Typography sx={{ fontWeight: 640, fontSize: 15, color: '#f2f2f3' }}>
                        {mod.title}
                      </Typography>
                      <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mod.description}
                      </Typography>
                    </Box>
                    <ArrowOutwardIcon sx={{ color: '#7f7f84', fontSize: 18 }} />
                  </CardActionArea>
                </Card>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      {view === 'athletes' && (
        <Athletes
          onboardRequestKey={onboardRequestKey}
          onOnboardRequestHandled={handleOnboardRequestHandled}
        />
      )}
      {view === 'contracts' && <Contracts />}
      {view === 'gear' && <GearItems />}
      {view === 'gear assignments' && <GearAssignments />}
      {view === 'gear requests' && (
        <React.Suspense fallback={<div>Loading...</div>}>
          <AdminGearRequestsTable />
        </React.Suspense>
      )}
      {view === 'trips' && <Trips />}
      {view === 'esim requests' && <EsimRequests />}
      {view === 'content' && <Content />}
      {view === 'events' && <CalendarGrid />}
      {view === 'announcements' && (
        <React.Suspense fallback={<div>Loading...</div>}>
          {React.createElement(require('./Announcements').default)}
        </React.Suspense>
      )}
    </Box>
  );
};

export default Dashboard;
