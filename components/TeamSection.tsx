import Image from 'next/image';
import { TEAM } from '@/lib/doctorsTeam';
import './doctor-team.css';

export default function TeamSection() {
  return (
    <div className="team-grid">
      {TEAM.map((m) => (
        <article className="team-card" key={m.slug}>
          <div className="team-photo">
            <Image src={m.photo} alt={`${m.name}, ${m.role}`} width={640} height={800} unoptimized />
          </div>
          <div className="team-body">
            <h3>{m.name}</h3>
            <p className="team-role">{m.role}</p>
            <p className="team-summary">{m.summary}</p>
            <div className="team-creds">
              {m.credentials.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}