import { DocsLayout, PageHeader, Section, SectionDiagram } from "@/components/layout/DocsLayout";

export default function CookiePolicy() {
  return (
    <DocsLayout>
      <PageHeader
        title="Cookie Policy"
        subtitle="Last updated: February 2026. This policy explains how Mougle uses cookies and similar technologies."
        badge="Legal"
      />

      <Section title="1. What Are Cookies?">
        <p>Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences, keep you logged in, and understand how you use the site. Similar technologies include local storage, session storage, and pixel tags.</p>
      </Section>

      <Section title="2. How We Use Cookies">
        <p>Mougle uses cookies for the following purposes:</p>

        <SectionDiagram>
          <div className="space-y-3">
            {[
              {
                type: "Essential Cookies",
                desc: "Required for the Platform to function. These handle authentication, session management, and security. Cannot be disabled.",
                examples: "Session tokens, CSRF protection, user preferences"
              },
              {
                type: "Functional Cookies",
                desc: "Remember your settings and preferences to provide a better experience. These include sidebar state, theme preferences, and language settings.",
                examples: "UI preferences, collapsed sidebar state, privacy mode selection"
              },
              {
                type: "Analytics Cookies",
                desc: "Help us understand how users interact with the Platform so we can improve it. Data is aggregated and anonymized.",
                examples: "Page views, feature usage, session duration, navigation patterns"
              },
              {
                type: "Performance Cookies",
                desc: "Monitor Platform performance and identify technical issues. Used to ensure the Platform runs smoothly for all users.",
                examples: "Load times, error rates, API response times"
              },
            ].map((cookie, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{i + 1}</div>
                  <div>
                    <div className="text-sm font-semibold mb-1">{cookie.type}</div>
                    <div className="text-xs text-muted-foreground mb-2">{cookie.desc}</div>
                    <div className="text-xs text-muted-foreground/60"><strong>Examples:</strong> {cookie.examples}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionDiagram>
      </Section>

      <Section title="3. Local Storage">
        <p>In addition to cookies, Mougle uses browser local storage to store:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Authentication state:</strong> Keeping you logged in between sessions</li>
          <li><strong>Admin tokens:</strong> Secure tokens for administrative access</li>
          <li><strong>User preferences:</strong> Theme, layout, and display preferences</li>
          <li><strong>Cache data:</strong> Temporary data to improve Platform responsiveness</li>
        </ul>
        <p>Local storage data remains on your device until explicitly cleared by you or the Platform.</p>
      </Section>

      <Section title="4. Third-Party Cookies">
        <p>We minimize the use of third-party cookies. Where they are used, they serve specific purposes:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Payment processing:</strong> Our payment provider may set cookies for transaction security</li>
          <li><strong>Analytics:</strong> Anonymized usage analytics to help us improve the Platform</li>
        </ul>
        <p>We do not use third-party advertising cookies. We do not participate in ad networks or cross-site tracking.</p>
      </Section>

      <Section title="5. Managing Cookies">
        <p>You can manage cookies through your browser settings. Most browsers allow you to:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>View and delete existing cookies</li>
          <li>Block all cookies or specific categories</li>
          <li>Set preferences for specific websites</li>
          <li>Get notifications when new cookies are set</li>
        </ul>
        <p>Note that disabling essential cookies may prevent the Platform from functioning correctly. You may not be able to log in or use core features without them.</p>
      </Section>

      <Section title="6. Cookie Duration">
        <p><strong>Session cookies:</strong> Deleted when you close your browser. Used for temporary authentication and navigation state.</p>
        <p><strong>Persistent cookies:</strong> Remain on your device for a set period (typically 30 days to 1 year). Used for remembering preferences and keeping you logged in.</p>
      </Section>

      <Section title="7. Updates to This Policy">
        <p>We may update this Cookie Policy as our technology evolves. Changes will be posted on this page with an updated revision date. Continued use of the Platform constitutes acceptance of the updated policy.</p>
      </Section>

      <Section title="8. Contact">
        <p>For questions about our use of cookies, contact us at privacy@mougle.com.</p>
      </Section>
    </DocsLayout>
  );
}
