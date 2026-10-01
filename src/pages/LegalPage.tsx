import { Link } from "react-router-dom";
import "./pages.css";

// E-mail público de contato exibido nas páginas legais.
const CONTACT_EMAIL = "suporte.synapsequiz@gmail.com";
const UPDATED_AT = "30 de setembro de 2026";

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page legal">
      <Link to="/" className="back-link">Lombada</Link>
      <header>
        <h1>{title}</h1>
        <p className="hint">Atualizado em {UPDATED_AT}</p>
      </header>
      {children}
      <p>
        Dúvidas: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidade">
      <section>
        <h2>Quais dados coletamos</h2>
        <ul>
          <li>Da sua conta: nome e e-mail. Se você entrar com o Google, recebemos do Google só o nome, o e-mail e a foto do perfil (nunca a senha da sua conta Google). Usamos só para identificar você no app e enviar a confirmação de conta, a redefinição de senha e os lembretes. A senha é guardada criptografada pelo Supabase e ninguém tem acesso a ela.</li>
          <li>O que você cadastra: coleção de volumes, capítulos em que parou, links e lembretes.</li>
          <li>Não coletamos senhas, dados de pagamento, localização ou dados de navegação para publicidade.</li>
        </ul>
      </section>
      <section>
        <h2>Fotos da estante</h2>
        <p>
          Quando você usa a leitura por foto, a imagem é enviada à API Gemini, do Google, para identificar as
          lombadas e depois descartada. O Lombada não guarda a foto. O Google pode usar dados enviados ao
          plano gratuito da API para melhorar seus serviços, conforme os{" "}
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">termos da API Gemini</a>.
          Evite fotografar documentos ou pessoas.
        </p>
      </section>
      <section>
        <h2>Onde os dados ficam</h2>
        <p>
          Os dados ficam no Supabase (banco de dados e login) e o site é servido pela Cloudflare. Cada pessoa só
          acessa os próprios dados. A edição que você cadastra (nome, editora, total de volumes) só aparece para
          você. Você também pode gerar, no Perfil, um link para mostrar a sua estante (obras, volumes que tem e
          o nome que você escolheu, sem e-mail nem anotações e sem séries +18) a quem você enviar o link. Dá para
          desligar o link a qualquer momento, e ele deixa de funcionar na hora.
        </p>
      </section>
      <section>
        <h2>E-mails</h2>
        <p>
          Só enviamos e-mails de conta: confirmação de cadastro e redefinição de senha.
          Não vendemos nem compartilhamos seu e-mail.
        </p>
      </section>
      <section>
        <h2>Seus direitos</h2>
        <p>
          Você pode pedir a exclusão da sua conta e de todos os seus dados a qualquer momento pelo e-mail abaixo,
          conforme a Lei Geral de Proteção de Dados (LGPD).
        </p>
      </section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Termos de uso">
      <section>
        <h2>O serviço</h2>
        <p>
          O Lombada é um projeto pessoal e gratuito para organizar coleções de mangás e livros físicos e anotar
          em que capítulo parou nos mangás. Ele é oferecido como está, sem garantia de disponibilidade contínua.
        </p>
      </section>
      <section>
        <h2>Uso adequado</h2>
        <ul>
          <li>Cadastre informações verdadeiras no catálogo compartilhado de edições.</li>
          <li>Não use o app para hospedar ou divulgar conteúdo pirata. O Lombada guarda apenas o link que você informar.</li>
          <li>A leitura por foto tem limite diário por pessoa para manter o serviço gratuito.</li>
        </ul>
      </section>
      <section>
        <h2>Seus dados</h2>
        <p>
          Os dados que você cadastra são seus. Veja como tratamos essas informações na{" "}
          <Link to="/privacidade">política de privacidade</Link>.
        </p>
      </section>
      <section>
        <h2>Mudanças</h2>
        <p>Estes termos podem ser atualizados. A data da última atualização fica no topo desta página.</p>
      </section>
    </LegalLayout>
  );
}
