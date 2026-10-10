import { AuthPage } from '../../../components/auth/auth-page';
export const metadata = { title: 'Create account' };
export default function Signup(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage mode="signup" {...props} />;
}
