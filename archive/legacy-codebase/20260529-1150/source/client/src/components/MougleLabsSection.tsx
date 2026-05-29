import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Cpu, Share2, Coins, ArrowRight, Sparkles, Bot, Zap, TrendingUp } from "lucide-react";

const FEATURES = [
  {
    icon: Cpu,
    title: "Build AI Tools",
    desc: "Create intelligent agents and tools powered by the Mougle intelligence network.",
    color: "from-blue-500 to-cyan-400",
  },
  {
    icon: Share2,
    title: "Publish & Share",
    desc: "Launch your creations to a growing community of builders and thinkers.",
    color: "from-violet-500 to-purple-400",
  },
  {
    icon: Coins,
    title: "Earn Automatically",
    desc: "Monetize your intelligence. Every usage generates value for you.",
    color: "from-amber-500 to-orange-400",
  },
];

function FloatingNode({ delay, x, y, size, color }: { delay: number; x: string; y: string; size: number; color: string }) {
  return (
    <motion.div
      className="absolute rounded-full blur-sm"
      style={{ left: x, top: y, width: size, height: size, background: color }}
      animate={{ y: [0, -8, 0, 6, 0], opacity: [0.5, 0.8, 0.5] }}
      transition={{ duration: 4 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

function DashboardMock() {
  const bars = [35, 52, 44, 68, 58, 75, 65, 82, 72, 90, 80, 95];

  return (
    <div className="relative w-full aspect-[4/3] max-w-md mx-auto">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-600/10 via-violet-600/10 to-purple-600/10 blur-2xl" />

      <FloatingNode delay={0} x="10%" y="15%" size={10} color="rgba(99,102,241,0.6)" />
      <FloatingNode delay={1.2} x="85%" y="25%" size={8} color="rgba(139,92,246,0.5)" />
      <FloatingNode delay={0.6} x="75%" y="70%" size={12} color="rgba(59,130,246,0.5)" />
      <FloatingNode delay={1.8} x="20%" y="80%" size={6} color="rgba(6,182,212,0.5)" />
      <FloatingNode delay={0.3} x="50%" y="10%" size={9} color="rgba(168,85,247,0.4)" />

      <motion.div
        className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/20"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white/90">Mougle Labs</div>
                <div className="text-[10px] text-white/40">Intelligence Dashboard</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400/80">Live</span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Revenue", value: "$2,840", icon: TrendingUp, trend: "+24%", color: "text-emerald-400" },
              { label: "AI Tools", value: "12", icon: Cpu, trend: "+3", color: "text-blue-400" },
              { label: "Users", value: "1.2K", icon: Zap, trend: "+18%", color: "text-violet-400" },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <stat.icon className={`w-3 h-3 ${stat.color}`} />
                  <span className="text-[9px] text-white/40">{stat.label}</span>
                </div>
                <div className="text-sm font-bold text-white/90">{stat.value}</div>
                <div className={`text-[9px] ${stat.color} font-medium`}>{stat.trend}</div>
              </motion.div>
            ))}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-white/50 font-medium">Readiness Overview</span>
              <span className="text-[10px] text-emerald-400/70">Sandbox signals</span>
            </div>
            <div className="flex items-end gap-[3px] h-16">
              {bars.map((h, i) => (
                <motion.div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/60 to-violet-500/80"
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.6, delay: 0.8 + i * 0.05, ease: "easeOut" }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            {[
              { name: "NovaSynth Agent", status: "Active", signal: "Reviewed", color: "bg-emerald-400" },
              { name: "DataForge Tool", status: "Active", signal: "Sandbox", color: "bg-emerald-400" },
              { name: "InsightBot", status: "Building", signal: "Draft", color: "bg-amber-400" },
            ].map((agent, i) => (
              <motion.div
                key={agent.name}
                className="flex items-center gap-2 p-2 rounded-lg border border-white/[0.04] bg-white/[0.015]"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 1.4 + i * 0.1 }}
              >
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary/30 to-violet-600/30 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-white/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-white/80 truncate">{agent.name}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${agent.color}`} />
                  <span className="text-[9px] text-white/40">{agent.status}</span>
                </div>
                <span className="text-[11px] font-semibold text-white/70">{agent.signal}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.05) 0%, transparent 50%, rgba(139,92,246,0.05) 100%)",
          }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}

export default function MougleLabsSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-80px" });

  return (
    <section
      id="mougle-labs"
      ref={sectionRef}
      className="relative overflow-hidden rounded-2xl"
      data-testid="section-mougle-labs"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f1e] via-[#0d1226] to-[#080c18]" />
      <div className="absolute inset-0 grid-pattern opacity-30" />

      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-primary/8 via-violet-600/5 to-transparent rounded-full -translate-y-1/2 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-gradient-to-tl from-cyan-500/6 via-blue-600/4 to-transparent rounded-full translate-y-1/2 blur-3xl" />

      <div className="relative px-6 py-12 md:px-10 md:py-16 lg:py-20">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 mb-5">
                <Sparkles className="w-3 h-3 text-primary" />
                <span className="text-[11px] font-medium text-primary/90">Intelligence Economy</span>
              </div>

              <h2
                className="text-2xl md:text-3xl lg:text-4xl font-display font-bold tracking-tight leading-tight"
                data-testid="text-labs-headline"
              >
                Mougle Labs —{" "}
                <span className="bg-gradient-to-r from-primary via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  Build Intelligence.
                </span>
                <br />
                Generate Opportunity.
              </h2>

              <p
                className="text-sm md:text-base text-muted-foreground mt-4 max-w-lg mx-auto lg:mx-0 leading-relaxed"
                data-testid="text-labs-subtext"
              >
                Create AI agents, launch tools, and participate in the evolving intelligence economy.
              </p>

              <div className="space-y-3 mt-8">
                {FEATURES.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] transition-all group"
                    initial={{ opacity: 0, x: -20 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.12, ease: "easeOut" }}
                    data-testid={`feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                      <feature.icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white/90">{feature.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                className="flex flex-col sm:flex-row items-center lg:items-start gap-3 mt-8"
                initial={{ opacity: 0, y: 15 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.6 }}
              >
                <Link href="/labs">
                  <Button
                    size="lg"
                    className="h-11 px-7 text-sm font-semibold rounded-xl gap-2 bg-gradient-to-r from-primary to-violet-600 text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:opacity-95 transition-all cursor-pointer w-full sm:w-auto"
                    data-testid="button-explore-labs"
                  >
                    Explore Mougle Labs
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-11 px-7 text-sm font-semibold rounded-xl gap-2 border-white/[0.12] hover:bg-white/[0.04] transition-all cursor-pointer w-full sm:w-auto"
                    data-testid="button-start-earning"
                  >
                    <Coins className="w-4 h-4" />
                    Start Earning
                  </Button>
                </Link>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="relative"
            >
              <DashboardMock />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
