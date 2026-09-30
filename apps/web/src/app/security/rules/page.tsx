import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security challenge rules',
  description: 'What you may and may not do in Forge security challenges.',
};

const ALLOWED = [
  'Analyse the files we give you: ciphertexts, logs, packet captures and source code.',
  'Write and run your own scripts on those files, on Forge or on your own computer.',
  'Use any public tool you like, such as Wireshark, CyberChef, grep or Python.',
  'Discuss techniques in general terms once you have solved a challenge.',
];

const FORBIDDEN = [
  'Attacking anything that is not a Forge challenge file, including other websites, networks, companies or people. The organisations and hosts in our stories are fictional.',
  'Attacking Forge itself: the website, API, code runner, other users or their accounts. Report problems you find instead (see below).',
  "Sharing flags or full solutions. Every flag is unique to your account; submitting someone else's flag is detected, logged and treated as cheating.",
  'Using what you learn here against systems you do not own or have written permission to test. That is illegal in most countries.',
];

export default function SecurityRulesPage() {
  // Set at deploy time; the address is the operator's decision, not ours.
  const contact = process.env.SECURITY_CONTACT_EMAIL;
  return (
    <article className="mx-auto grid max-w-2xl gap-6 px-4 py-12">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold">Security challenge rules</h1>
        <p className="text-muted-foreground">
          Forge security challenges are practice exercises built for Forge. They use harmless,
          purpose-made files. The short version:{' '}
          <strong>only attack Forge&apos;s own challenge files, never real systems.</strong>
        </p>
      </header>
      <section className="grid gap-2" aria-labelledby="allowed">
        <h2 id="allowed" className="text-lg font-semibold">
          You may
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          {ALLOWED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="grid gap-2" aria-labelledby="forbidden">
        <h2 id="forbidden" className="text-lg font-semibold">
          You may not
        </h2>
        <ul className="list-disc space-y-1 pl-6">
          {FORBIDDEN.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="grid gap-2" aria-labelledby="flags">
        <h2 id="flags" className="text-lg font-semibold">
          How flags work
        </h2>
        <p>
          Flags look like <code>FORGE&#123;...&#125;</code>. The files you download are generated
          for your account, and the flag inside them only counts for you. Breaking these rules can
          lead to losing solved credit or your account.
        </p>
      </section>
      <section className="grid gap-2" aria-labelledby="report">
        <h2 id="report" className="text-lg font-semibold">
          Found a real vulnerability?
        </h2>
        <p>
          If you think you have found a security problem in Forge itself, stop testing and tell us
          {contact ? (
            <>
              {' '}
              at{' '}
              <a className="underline" href={`mailto:${contact}`}>
                {contact}
              </a>
            </>
          ) : null}
          . Please do not access other users&apos; data or disrupt the service.
        </p>
      </section>
      <p>
        <Link className="underline" href="/problems?track=security">
          Browse security challenges
        </Link>
      </p>
    </article>
  );
}
