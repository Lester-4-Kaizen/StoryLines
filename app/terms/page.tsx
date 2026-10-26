import Link from 'next/link'
import { LegalDocument } from '@/components/shared/legal-document'

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Service agreement"
      title="Terms of Use"
      description="These terms set expectations for using StoryLines, sharing creative work, and participating in the community."
      updatedOn="October 26, 2026"
      updatedAt="2026-10-26"
      sections={[
        {
          id: 'acceptance',
          title: 'Agreement and eligibility',
          content: (
            <>
              <p>By creating an account or using StoryLines, you agree to these Terms and the <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the service.</p>
              <p>You must be legally able to use the service where you live. If you are under the age of majority, use StoryLines only with any permission or supervision required by applicable law.</p>
            </>
          ),
        },
        {
          id: 'account',
          title: 'Your account',
          content: (
            <>
              <p>Provide information that is accurate enough to operate your account, keep your sign-in credentials secure, and promptly address activity you do not recognize. You are responsible for activity performed through your account, except where applicable law says otherwise.</p>
              <p>Do not impersonate another person, share access without authorization, evade account restrictions, or interfere with the security of StoryLines.</p>
            </>
          ),
        },
        {
          id: 'content',
          title: 'Your content and permissions',
          content: (
            <>
              <p>You retain the rights you hold in the stories, art, comics, messages, and other material you submit. You are responsible for ensuring that you own or have permission to upload and share that material, and for respecting the rights and privacy of others.</p>
              <p>To operate StoryLines, you grant the service a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, and technically adapt your submitted content as needed to provide, secure, and improve the features you choose to use. This license is limited to operating the service and ends when the content is removed, subject to temporary copies, backups, and legal retention requirements.</p>
              <p>Other users may view or interact with content you make public through StoryLines. This does not transfer ownership of your work or give users permission to republish it outside the service.</p>
              <p>Some conversation settings are shared with both participants: chat background and theme, bubble color, nicknames, and quick reactions. By choosing these settings, you understand that the other participant can see them. Pinning a conversation and accessibility preferences are personal settings.</p>
            </>
          ),
        },
        {
          id: 'acceptable-use',
          title: 'Acceptable use',
          content: (
            <>
              <p>Use StoryLines lawfully and respectfully. Do not upload content that infringes rights, threaten or harass others, distribute malicious code or scams, send spam, manipulate engagement, or attempt to access data or accounts without authorization.</p>
              <p>Community participation is also subject to the <Link href="/guidelines">Community Guidelines</Link>, which are part of these Terms.</p>
              <p>You may report profiles, works, posts, comments, and messages using the in-app reporting tools. Do not submit knowingly false or abusive reports. You may also block an account; blocking hides accounts and their content from one another and removes follows in both directions. Blocking does not notify the other account that you reported them, and unblocking does not automatically restore follows.</p>
            </>
          ),
        },
        {
          id: 'moderation',
          title: 'Moderation and enforcement',
          content: (
            <>
              <p>Authorized moderators may review reports and related account history. Depending on the severity, context, and history of a matter, StoryLines may dismiss a report, hide content, issue a warning, temporarily suspend an account, or permanently ban an account. Warnings are recorded, but there is no automatic fixed warning count that triggers a particular restriction.</p>
              <p>During a suspension, an account may view public community posts and profiles only; posting, commenting, reporting, messaging, and reading stories are unavailable until the suspension ends. A ban disables access to StoryLines. Where available, the service may send an outcome update to the reporter and/or the reported person. This notice is not guaranteed for every report or action. Moderation decisions and restrictions may be recorded in internal audit records.</p>
              <p>Where practical, StoryLines may provide notice or an opportunity to address an issue. This does not prevent action needed to address urgent safety, legal, or security risks.</p>
            </>
          ),
        },
        {
          id: 'availability',
          title: 'Availability and third-party services',
          content: (
            <>
              <p>StoryLines is evolving. Features may change, be interrupted, or become unavailable. The service depends on third-party providers for hosting, authentication, storage, analytics, and image delivery; their terms and availability may also affect your experience.</p>
              <p>To the extent permitted by law, StoryLines is provided on an “as available” basis without guarantees that it will be uninterrupted, error-free, or suitable for every purpose.</p>
            </>
          ),
        },
        {
          id: 'termination',
          title: 'Resetting or closing your account',
          content: (
            <>
              <p>You may use <Link href="/settings">Settings</Link> to reset account data while retaining your login, or permanently delete your account. Reset and deletion have different effects; review the confirmation shown in Settings before proceeding.</p>
              <p>StoryLines may suspend or end access when required to enforce these Terms or protect the service. Provisions that by their nature should continue after account closure, including content rights already granted for service operation, liability limits, and dispute terms, will continue only to the extent applicable law permits.</p>
            </>
          ),
        },
        {
          id: 'liability',
          title: 'Limitations and applicable law',
          content: (
            <>
              <p>Nothing in these Terms limits rights or remedies that cannot lawfully be limited. To the extent permitted by law, StoryLines is not responsible for indirect or consequential losses arising from use of the service, third-party provider outages, or user-submitted content.</p>
              <p>Applicable law and any available dispute process depend on the service operator and where you live. The service operator should publish its legal name, contact details, and governing-law information before these Terms are treated as a final legal agreement.</p>
            </>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to these Terms',
          content: <p>StoryLines may update these Terms as the service or legal requirements change. The current version and revision date will be published here. Continued use after an update takes effect means you accept the updated Terms where applicable law permits.</p>,
        },
      ]}
    />
  )
}
