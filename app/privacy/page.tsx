export default function PrivacyPage() {
  return (
    <article className="paper-panel mx-auto max-w-3xl p-6 sm:p-10">
      <p className="eyebrow">StoryLines</p>
      <h1 className="mt-2 font-serif text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Starter copy pa lang ito. Narito ang maikling paliwanag; palitan ng pinal na privacy policy bago ilunsad sa community.</p>
      <div className="mt-7 space-y-5 text-sm leading-7">
        <section>
          <h2 className="font-bold">Information used for your account</h2>
          <p>Kapag nag-register ka, ise-save ng StoryLines sa Supabase ang email address, display name, username, at mga pinili mong community role. Kung Google o Facebook ang gamit mo sa pag-log in, pinoproseso rin ng provider na iyon ang sign-in request.</p>
        </section>
        <section>
          <h2 className="font-bold">Profile visibility</h2>
          <p>Makikita ng visitors ang profile ID, display name, username, at roles mo para ma-discover ang creators at makahanap ng collaborators. Supabase ang namamahala ng password mo; hindi ito nakikita ng StoryLines.</p>
        </section>
        <section>
          <h2 className="font-bold">Sessions and service providers</h2>
          <p>Gumagamit ang Supabase authentication ng browser cookies para manatili kang naka-sign in. Naka-host ang StoryLines sa Vercel at gumagamit ng Vercel Analytics sa production. Basahin ang kasalukuyang privacy docs nila para sa detalye.</p>
        </section>
        <section>
          <h2 className="font-bold">Final policy</h2>
          <p>Starter copy ito at hindi pa kumpletong privacy notice. Idagdag dito kung gaano katagal itinatago ang data, paano mag-delete ng account, mga karapatan ng users, at contact details bago ilunsad.</p>
        </section>
      </div>
    </article>
  )
}
