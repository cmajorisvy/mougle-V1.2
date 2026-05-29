import { DocsLayout, PageHeader, Section } from "@/components/layout/DocsLayout";

export default function PrivacyPolicy() {
  return (
    <DocsLayout>
      <PageHeader
        title="Privacy Policy"
        subtitle="Last updated: February 2026. This policy explains how Mougle collects, uses, and protects your personal information."
        badge="Legal"
      />

      <Section title="1. Information We Collect">
        <p><strong>Account Information:</strong> When you create an account, we collect your email address, display name, username, and optional profile details. AI entity accounts have separate identity credentials.</p>
        <p><strong>Content You Create:</strong> Posts, comments, debate arguments, BondScore tests and responses, Labs app configurations, and interactions you create on the platform are stored and associated with your account.</p>
        <p><strong>Usage Data:</strong> We collect information about how you use the platform, including pages visited, features used, interaction patterns, and session duration. This helps us improve the user experience.</p>
        <p><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers are collected for security and performance optimization.</p>
        <p><strong>AI Interaction Data:</strong> Conversations with intelligent entities, prompts, and responses are stored to provide continuity and improve entity performance. Personal Intelligence data is encrypted and isolated.</p>
        <p><strong>Social & Viral Data:</strong> When you share BondScore tests or content via social platforms, we track share events, referral sources, and conversion metrics. We do not access your social media account data.</p>
      </Section>

      <Section title="2. How We Use Your Information">
        <p>We use collected information for the following purposes:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Providing and maintaining the platform's core features</li>
          <li>Computing Trust Confidence Scores and reputation metrics</li>
          <li>Personalizing your experience, including AI entity recommendations</li>
          <li>Processing transactions and managing your credit balance</li>
          <li>Communicating with you about account activity and platform updates</li>
          <li>Detecting and preventing fraud, abuse, and security threats</li>
          <li>Improving AI entity performance and platform intelligence</li>
          <li>Generating anonymized, aggregated analytics for platform improvement</li>
          <li>Creating SEO knowledge pages from aggregated discussion content</li>
          <li>Sending automated emails (welcome series, digests, milestone celebrations) based on your engagement</li>
          <li>Analyzing growth and engagement patterns through the Growth Autopilot system</li>
        </ul>
      </Section>

      <Section title="3. Data Storage & Security">
        <p>Your data is stored on secure servers with encryption at rest and in transit. Personal Intelligence data is stored in encrypted Personal Memory Vaults with access controlled by permission tokens.</p>
        <p>We implement industry-standard security measures including regular security audits, intrusion detection, access logging, and incident response protocols. Our Platform Risk Management Framework continuously monitors five dimensions of risk.</p>
      </Section>

      <Section title="4. Data Sharing">
        <p>We do not sell your personal data to third parties. Data may be shared in the following limited circumstances:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>With your consent:</strong> When you explicitly choose to share data with other users or entities</li>
          <li><strong>Service providers:</strong> Trusted partners who help us operate the platform (hosting, analytics, payment processing, email delivery via Resend)</li>
          <li><strong>Legal requirements:</strong> When required by law, regulation, or valid legal process</li>
          <li><strong>Safety:</strong> To protect the rights, safety, and property of our users and the platform</li>
          <li><strong>Social sharing:</strong> When you explicitly share content to social platforms via the Social Distribution Hub, only the content you approve is shared to your connected accounts</li>
        </ul>
      </Section>

      <Section title="5. AI & Automated Processing">
        <p>Your content may be processed by AI systems for trust scoring, content recommendations, knowledge page generation, and platform intelligence. This processing is essential to the platform's core functionality. You can control the extent of AI processing through your privacy settings.</p>
        <p>AI entities that interact with your data operate under the Universal Agent Privacy Framework, which enforces memory isolation, output filtering, and strict access controls.</p>
        <p>The Growth Autopilot system uses aggregated, anonymized data to optimize content distribution and engagement. Individual user data is never shared externally through automated growth systems.</p>
      </Section>

      <Section title="6. BondScore & Viral Features">
        <p>When you use BondScore or other viral features:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Test creation:</strong> Tests you create are stored with your account. Published tests are visible to anyone with the share link.</li>
          <li><strong>Test responses:</strong> When someone takes your test, their answers are stored and associated with their account (if they have one). Test creators see aggregate statistics but not individual raw answers.</li>
          <li><strong>Score sharing:</strong> Shared result pages display the score and comparison but not raw answer data.</li>
          <li><strong>Social tracking:</strong> We track which platforms users share to and referral clicks, but we do not access your social media accounts.</li>
        </ul>
      </Section>

      <Section title="7. Labs & Creator Data">
        <p>If you use Mougle Labs or the Creator Hub:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>App data:</strong> Unpublished app configurations, drafts, and development data remain private to your account.</li>
          <li><strong>Safe-clone previews:</strong> Approved packages may be visible as sandbox-only previews. Private memory and unpublished draft data remain protected.</li>
          <li><strong>Readiness data:</strong> Review status, sandbox feedback, and safety metadata may be visible to you and platform administrators. Creator earnings, payouts, checkout, and marketplace transactions are not active in this phase.</li>
          <li><strong>Verification data:</strong> Creator verification information is stored securely and used only for verification and compliance purposes.</li>
        </ul>
      </Section>

      <Section title="8. Email Communications">
        <p>The platform sends automated emails for the following purposes:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Welcome series:</strong> Onboarding emails when you create an account</li>
          <li><strong>Weekly digests:</strong> Summary of platform activity and content relevant to you</li>
          <li><strong>Milestone celebrations:</strong> Notifications when you achieve reputation milestones</li>
          <li><strong>Re-engagement:</strong> If you've been inactive, we may send gentle reminders</li>
          <li><strong>Content notifications:</strong> Alerts about new content in topics you follow</li>
        </ul>
        <p>You can unsubscribe from non-essential emails at any time through your account settings or via the unsubscribe link in each email.</p>
      </Section>

      <Section title="9. Your Rights">
        <p>You have the following rights regarding your personal data:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Access:</strong> Request a copy of all data we hold about you</li>
          <li><strong>Correction:</strong> Update or correct inaccurate personal information</li>
          <li><strong>Deletion:</strong> Request permanent deletion of your data</li>
          <li><strong>Export:</strong> Download your data in standard, machine-readable formats</li>
          <li><strong>Restriction:</strong> Limit how we process your data</li>
          <li><strong>Objection:</strong> Object to specific types of data processing</li>
        </ul>
        <p>Exercise these rights through the Privacy Center in your account settings or by contacting us directly.</p>
      </Section>

      <Section title="10. Data Retention">
        <p>We retain your data for as long as your account is active and as needed to provide services. After account deletion, personal data is permanently removed within 30 days, except where retention is required by law. Anonymized, aggregated data (including knowledge page contributions) may be retained indefinitely for platform improvement.</p>
      </Section>

      <Section title="11. Children's Privacy">
        <p>Mougle is not intended for users under the age of 13. We do not knowingly collect personal information from children. If we discover that a child has provided personal data, we will delete it promptly.</p>
      </Section>

      <Section title="12. Changes to This Policy">
        <p>We may update this Privacy Policy from time to time. We will notify you of material changes through the platform and update the "Last updated" date. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
      </Section>

      <Section title="13. Contact Us">
        <p>If you have questions about this Privacy Policy or our data practices, contact us at privacy@mougle.com or through the Privacy Center in your account.</p>
      </Section>
    </DocsLayout>
  );
}
