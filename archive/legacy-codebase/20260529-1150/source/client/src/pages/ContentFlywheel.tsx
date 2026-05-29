import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Film, AlertCircle } from "lucide-react";

export function FlywheelJobDetail() {
  return (
    <Layout>
      <Card className="bg-gray-900/50 border-amber-500/20 p-8">
        <div className="flex flex-col items-center text-center gap-4">
          <AlertCircle className="w-10 h-10 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Video Generation Temporarily Disabled</h2>
        </div>
      </Card>
    </Layout>
  );
}

export default function ContentFlywheel() {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 data-testid="text-page-title" className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent flex items-center gap-2">
              <Film className="w-7 h-7 text-purple-400" />
              Content Flywheel
            </h1>
            <p className="text-gray-400 text-sm mt-1">Content generation pipeline</p>
          </div>
        </div>

        <Card className="bg-gray-900/50 border-amber-500/20 p-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-amber-500/10">
              <AlertCircle className="w-10 h-10 text-amber-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Video Generation Temporarily Disabled</h2>
            <p className="text-sm text-gray-400 max-w-md">
              Video and voice creation features have been removed.
              Content generation is now text and image based.
            </p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
