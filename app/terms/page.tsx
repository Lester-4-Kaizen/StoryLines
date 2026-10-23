import Link from 'next/link'
import { LegalDocument } from '@/components/shared/legal-document'

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Service agreement"
      title="Terms of Use"
      description="These terms set expectations for using StoryLines, sharing creative work, and participating in the community."
      updatedOn="October 23, 2026"
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
            </>
          ),
        },
        {
          id: 'moderation',
          title: 'Moderation and enforcement',
          content: (
            <>
              <p>StoryLines may review content and activity, remove or restrict material, limit features, or suspend or terminate accounts when reasonably necessary to protect users, comply with law, or enforce these Terms and the Community Guidelines.</p>
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
