import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Calendar, CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { ActivityChart } from "@/components/dashboard/ActivityChart";

export default function WeeklyReport() {
  useEffect(() => {
    document.title = "Weekly Intelligence Report | Mougle";
  }, []);

  const reports = [
    { id: 1, date: "May 13 - May 19, 2024", status: "Ready", type: "Full Analysis" },
    { id: 2, date: "May 06 - May 12, 2024", status: "Archived", type: "Summary" },
    { id: 3, date: "Apr 29 - May 05, 2024", status: "Archived", type: "Full Analysis" },
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Weekly Intelligence Reports
          </h1>
          <p className="text-muted-foreground mt-2">
            Aggregated insights and signal analysis for the past 7 days.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="glass-card md:col-span-2">
            <CardHeader>
              <CardTitle>Current Week Activity</CardTitle>
              <CardDescription>Signal volume and key metrics</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ActivityChart />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold">Report Archive</h2>
          <div className="grid gap-4">
            {reports.map((report) => (
              <div 
                key={report.id}
                className="flex items-center justify-between p-4 rounded-lg bg-card/40 border border-border/50 hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      Weekly Report: {report.date}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {report.type}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-green-500">
                        <CheckCircle2 className="w-3 h-3" /> {report.status}
                      </span>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="hover:bg-primary/10 hover:text-primary">
                  <Download className="w-4 h-4 mr-2" /> Download PDF
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}