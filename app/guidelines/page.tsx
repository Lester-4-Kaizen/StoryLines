import { LegalDocument } from '@/components/shared/legal-document'

export default function GuidelinesPage() {
  return (
    <LegalDocument
      eyebrow="Community standards"
      title="Community Guidelines"
      description="StoryLines is a place for Filipino readers and creators to share stories, comics, and ideas. These standards help keep participation respectful, safe, and welcoming."
      updatedOn="October 23, 2026"
      sections={[
        {
          id: 'respect',
          title: 'Treat people with respect',
          content: (
            <>
              <p>Disagree with ideas without attacking the people behind them. Harassment, hate speech, threats, targeted abuse, doxxing, and repeated unwanted contact are not allowed.</p>
              <p>Respect boundaries in comments, direct messages, collaboration requests, and any other interaction. If someone asks you to stop contacting them, respect that boundary.</p>
            </>
          ),
        },
        {
          id: 'original-work',
          title: 'Share work you have the right to share',
          content: (
            <>
              <p>Post writing, illustrations, comics, and other material that you created or are authorized to share. Do not repost someone else’s work, remove attribution, or claim another person’s work as your own.</p>
              <p>Credit collaborators and other creators when appropriate. A credit does not replace permission when permission is required.</p>
            </>
          ),
        },
        {
          id: 'safe-content',
          title: 'Keep content and interactions safe',
          content: (
            <>
              <p>Do not use StoryLines to share illegal content, exploitative material, malware, scams, or content intended to threaten or harm others. Do not use the service to impersonate someone, mislead members, or send spam.</p>
              <p>Use available content warnings and audience details honestly. Do not use tags, descriptions, or images to disguise material or evade moderation.</p>
            </>
          ),
        },
        {
          id: 'accounts',
          title: 'Use your account responsibly',
          content: (
            <>
              <p>Keep your account details accurate, protect your sign-in credentials, and do not access another person’s account or attempt to bypass access controls.</p>
              <p>Do not create accounts or use automated activity to manipulate follows, reactions, rankings, or other community features.</p>
            </>
          ),
        },
        {
          id: 'moderation',
          title: 'Moderation and reporting',
          content: (
            <>
              <p>StoryLines may review or limit content and account activity that appears to violate these Guidelines, our Terms of Use, or applicable law. Actions may include removing content, restricting features, or suspending or closing an account, depending on the circumstances.</p>
              <p>If you encounter a concern, avoid amplifying it and contact the StoryLines team through the support channel provided by the service operator. Include relevant links and context, but do not repost harmful material to report it.</p>
            </>
          ),
        },
        {
          id: 'updates',
          title: 'Updates to these standards',
          content: <p>These Guidelines may change as StoryLines and its community evolve. The latest version will be published on this page with its revision date.</p>,
        },
      ]}
    />
  )
}
