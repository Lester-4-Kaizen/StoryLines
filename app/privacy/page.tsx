import Link from 'next/link'
import { LegalDocument } from '@/components/shared/legal-document'

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Your information"
      title="Privacy Policy"
      description="This policy explains what information StoryLines handles, how it supports the service, and the choices available to you."
      updatedOn="October 23, 2026"
      sections={[
        {
          id: 'information',
          title: 'Information StoryLines handles',
          content: (
            <>
              <p><strong>Account and profile information.</strong> This can include your email address, display name, username, selected roles, biography, profile links, and profile picture. Sign-in providers may return basic account details when you choose Google or Facebook login.</p>
              <p><strong>Content and activity.</strong> StoryLines stores the works, chapters, comic pages, community posts, comments, reactions, follows, saved items, reading progress, and messages that you choose to create or use.</p>
              <p><strong>Service and device information.</strong> Authentication uses cookies or related browser storage to maintain your session. Hosting and analytics providers may process technical request and usage information needed to deliver, protect, and measure the service.</p>
            </>
          ),
        },
        {
          id: 'uses',
          title: 'How information is used',
          content: (
            <ul>
              <li>To create and secure accounts and provide sign-in, profile, publishing, reading, community, and messaging features.</li>
              <li>To display public profiles and content, and to deliver notifications, follows, and other interactions you request.</li>
              <li>To operate, troubleshoot, maintain, and improve StoryLines and help protect the service from abuse.</li>
              <li>To comply with applicable legal obligations and respond to valid requests.</li>
            </ul>
          ),
        },
        {
          id: 'visibility',
          title: 'What is public and what is private',
          content: (
            <>
              <p>Published works, community posts, comments, and profile details selected for display may be visible to visitors. Avoid including private or sensitive information in public content.</p>
              <p>Private account data and interactions are subject to access controls, including Supabase Row Level Security policies. Direct messages are intended for their participants. No online service can guarantee absolute security, so use care when deciding what to share.</p>
            </>
          ),
        },
        {
          id: 'providers',
          title: 'Service providers and storage',
          content: (
            <>
              <p>StoryLines uses Supabase for authentication, database, and file storage; Vercel for hosting and production analytics; and Cloudflare Images for creator-uploaded work and comic imagery. Google or Facebook may process sign-in requests when you select those options. These providers handle information under their own terms and privacy notices.</p>
              <p>StoryLines does not put a Supabase service-role key in the browser. Access to data is additionally governed by application permissions and database policies.</p>
            </>
          ),
        },
        {
          id: 'retention',
          title: 'Retention and account controls',
          content: (
            <>
              <p>Information is retained while needed to operate the service, maintain your account and content, resolve disputes, or meet legal obligations. Exact retention periods may depend on the data type, provider, and applicable requirements.</p>
              <p>Use <Link href="/settings">Settings</Link> to reset account data while keeping your login, or to request permanent account deletion. A reset removes account activity and creator content supported by the reset flow and returns the profile to Reader. Deletion removes the account; some copies may remain temporarily in provider backups or where retention is legally required.</p>
              <p>You can update profile information through profile settings. You may also have additional privacy rights under the laws that apply to you.</p>
            </>
          ),
        },
        {
          id: 'children',
          title: 'Children and age',
          content: <p>StoryLines is not designed to knowingly collect personal information from children who are not permitted to use the service under applicable law. If you believe a child has provided personal information inappropriately, contact the service operator so it can be reviewed.</p>,
        },
        {
          id: 'contact',
          title: 'Questions and policy changes',
          content: (
            <>
              <p>For privacy questions or requests that cannot be completed through Settings, contact the StoryLines service operator through the support channel published for this service. The operator should provide a verified contact method before public launch.</p>
              <p>This policy may be updated as the service changes. The current version and revision date will be shown here.</p>
            </>
          ),
        },
      ]}
    />
  )
}
