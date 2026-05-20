import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import SignIn from "./components/SignIn";
import UsernameSetup from "./components/UsernameSetup";
import MainApp from "./components/MainApp";

function Splash({ text }: { text: string }) {
  return (
    <div className="splash">
      <img src="/icon.svg" alt="" width={56} height={56} />
      <p>{text}</p>
    </div>
  );
}

function Gate() {
  const profile = useQuery(api.profiles.me);
  if (profile === undefined) return <Splash text="Cargando…" />;
  if (!profile || !profile.username) return <UsernameSetup />;
  return <MainApp username={profile.username} userId={profile.userId} />;
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <Splash text="Cargando…" />
      </AuthLoading>
      <Unauthenticated>
        <SignIn />
      </Unauthenticated>
      <Authenticated>
        <Gate />
      </Authenticated>
    </>
  );
}
