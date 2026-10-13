import { useEffect } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "./data/react";
import { api } from "./data/api";
import type { Id } from "./data/types";
import { useCachedQuery } from "./hooks/useCachedQuery";
import {
  forgetUser,
  readLastUser,
  setCacheOwner,
  writeLastUser,
} from "./lib/queryCache";
import SignIn from "./components/SignIn";
import NoAccess from "./components/UsernameSetup";
import MainApp from "./components/MainApp";

function Splash({ text }: { text: string }) {
  return (
    <div className="splash">
      <img src="/icon.svg" alt="" width={56} height={56} />
      <p>{text}</p>
    </div>
  );
}

/**
 * Mientras se valida el token guardado no sabemos aún quién es el usuario,
 * pero sí sabemos quién fue la última vez en este dispositivo. Pintamos su
 * app con los datos cacheados en lugar de un splash: es la diferencia entre
 * abrir y poder escribir ya, o mirar el logo un par de segundos.
 *
 * Si el token resulta no valer, React cambia a <Unauthenticated> y ahí se
 * borra todo (ver SignedOut).
 */
function BootGate() {
  const last = readLastUser();
  if (!last) return <Splash text="Cargando…" />;
  return (
    <MainApp username={last.username} userId={last.userId as Id<"users">} />
  );
}

/**
 * No hay sesión: se olvida al usuario anterior (datos cacheados incluidos)
 * antes de enseñar el login. Este es el punto que garantiza que quien inicie
 * sesión después NUNCA vea nada del anterior, porque para autenticarse hay
 * que pasar obligatoriamente por aquí.
 */
function SignedOut() {
  useEffect(() => {
    forgetUser();
  }, []);
  return <SignIn />;
}

function Gate() {
  const profile = useCachedQuery(api.profiles.me, {});
  const last = readLastUser();

  useEffect(() => {
    if (!profile?.userId) return;
    // Si el usuario autenticado no es el dueño de la caché, setCacheOwner la
    // tira entera. Red de seguridad frente a un localStorage heredado; el
    // caso normal ya lo cubre SignedOut.
    setCacheOwner(profile.userId);
    if (profile.username) {
      writeLastUser({ userId: profile.userId, username: profile.username });
    }
  }, [profile?.userId, profile?.username]);

  // Aún no ha llegado el perfil: seguimos con el último usuario conocido.
  if (profile === undefined) {
    return last ? (
      <MainApp username={last.username} userId={last.userId as Id<"users">} />
    ) : (
      <Splash text="Cargando…" />
    );
  }

  // Cuenta de la Intranet sin alta en el todo (o archivada).
  if (!profile || profile.noAccess || !profile.username) return <NoAccess />;

  // La key fuerza remontaje si resulta ser otro usuario del que teníamos
  // cacheado, para que las vistas vuelvan a leer la caché ya limpia.
  return (
    <MainApp
      key={profile.userId}
      username={profile.username}
      userId={profile.userId}
    />
  );
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <BootGate />
      </AuthLoading>
      <Unauthenticated>
        <SignedOut />
      </Unauthenticated>
      <Authenticated>
        <Gate />
      </Authenticated>
    </>
  );
}
