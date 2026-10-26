import { LegalDocument } from '@/components/shared/legal-document'

export default function GuidelinesPage() {
  return (
    <LegalDocument
      eyebrow="Community standards"
      title="Community Guidelines"
      description="StoryLines is a place for Filipino readers and creators to share stories, comics, and ideas. These standards help keep participation respectful, safe, and welcoming."
      updatedOn="October 26, 2026"
      updatedAt="2026-10-26"
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
              <p>Use the in-app report option on a profile, work, post, comment, or message to flag a concern. Reports are reviewed by authorized StoryLines moderators. Include relevant context, but do not repost harmful material to report it. Reporter identities are not disclosed to the reported person.</p>
              <p>Depending on the circumstances, moderators may dismiss a report, hide reported content, issue a warning, temporarily suspend an account, or permanently ban it. A warning is recorded on the account; there is no automatic fixed warning count that triggers a suspension or ban. Decisions may consider the seriousness and context of the conduct and an account’s history. Where available, the moderation team may send an outcome update to the reporter and/or the reported person.</p>
              <p>A suspended account may view public community posts and profiles only; it cannot post, comment, report, message, or read stories until the suspension ends. A banned account cannot access StoryLines. These measures do not replace any action required by law.</p>
            </>
          ),
        },
        {
          id: 'blocking',
          title: 'Blocking and personal boundaries',
          content: (
            <>
              <p>You can block an account from its profile, from a report flow, or in Messages. Blocking hides that account’s profile, content, and messages from you, and hides your profile and content from that account. It also removes follows between you in both directions.</p>
              <p>Manage blocked accounts in Settings. Unblocking makes the account visible again, but does not restore either follow automatically. Blocking is a personal safety control and does not replace reporting a Guidelines violation.</p>
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
