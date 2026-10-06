import { AuthPage } from '../../../components/auth/auth-page';
export const metadata = { title: 'Sign in' };
export default function Login(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage mode="login" {...props} />;
}
