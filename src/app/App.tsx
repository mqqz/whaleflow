import { TopNavigation } from "./components/TopNavigation";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { NetworkGraph } from "./components/NetworkGraph";
import { TransactionFeed } from "./components/TransactionFeed";

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      {/* Top Navigation */}
      <TopNavigation />

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-64px)] mt-16">
        {/* Left Sidebar */}
        <LeftSidebar />

        {/* Center Content */}
        <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
          {/* Network Graph */}
          <div className="flex-1">
            <NetworkGraph />
          </div>

          {/* Transaction Feed */}
          <TransactionFeed />
        </div>

        {/* Right Sidebar */}
        <RightSidebar />
      </div>
    </div>
  );
}