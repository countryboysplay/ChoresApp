import { Navigate, Route, Routes } from 'react-router-dom';
import { ChildShell } from './components/ChildShell';
import { ParentShell } from './components/ParentShell';
import { Splash } from './screens/child/Splash';
import { ProfileSelect } from './screens/child/ProfileSelect';
import { PinEntry } from './screens/child/PinEntry';
import { ChildHome } from './screens/child/Home';
import { Missions } from './screens/child/Missions';
import { ChoreDetail } from './screens/child/ChoreDetail';
import { Rewards } from './screens/child/Rewards';
import { Wallet } from './screens/child/Wallet';
import { Leaderboard } from './screens/child/Leaderboard';
import { Achievements } from './screens/child/Achievements';
import { Notifications } from './screens/child/Notifications';
import { Profile } from './screens/child/Profile';
import { ParentDashboard } from './screens/parent/Dashboard';
import { ApprovalQueue } from './screens/parent/Approvals';
import { ApprovalReview } from './screens/parent/ApprovalReview';
import { Schedule } from './screens/parent/Schedule';
import { ChoreWizard } from './screens/parent/ChoreWizard';
import { BonusManage } from './screens/parent/BonusManage';
import { RewardManage } from './screens/parent/RewardManage';
import { ChildManage } from './screens/parent/ChildManage';
import { Settings } from './screens/parent/Settings';
import { SystemStatus } from './screens/parent/SystemStatus';
import { NotFound } from './pages/NotFound';
import { Health } from './pages/Health';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/profiles" element={<ProfileSelect />} />
      <Route path="/pin/:userId" element={<PinEntry />} />
      <Route path="/health" element={<Health />} />

      <Route element={<ChildShell />}>
        <Route path="/child/home" element={<ChildHome />} />
        <Route path="/child/missions" element={<Missions />} />
        <Route path="/child/chore/:choreId" element={<ChoreDetail />} />
        <Route path="/child/rewards" element={<Rewards />} />
        <Route path="/child/wallet" element={<Wallet />} />
        <Route path="/child/leaderboard" element={<Leaderboard />} />
        <Route path="/child/achievements" element={<Achievements />} />
        <Route path="/child/notifications" element={<Notifications />} />
        <Route path="/child/profile" element={<Profile />} />
        <Route path="/child" element={<Navigate to="/child/home" replace />} />
      </Route>

      <Route element={<ParentShell />}>
        <Route path="/parent" element={<ParentDashboard />} />
        <Route path="/parent/approvals" element={<ApprovalQueue />} />
        <Route path="/parent/approvals/:submissionId" element={<ApprovalReview />} />
        <Route path="/parent/schedule" element={<Schedule />} />
        <Route path="/parent/chores/new" element={<ChoreWizard />} />
        <Route path="/parent/bonus" element={<BonusManage />} />
        <Route path="/parent/rewards" element={<RewardManage />} />
        <Route path="/parent/children" element={<ChildManage />} />
        <Route path="/parent/settings" element={<Settings />} />
        <Route path="/parent/system" element={<SystemStatus />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
