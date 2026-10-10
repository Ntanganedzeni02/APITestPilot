import { AuthPage } from '../../../components/auth/auth-page';
export const metadata = { title: 'Forgot password' };
export default function Forgot(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage mode="forgot" {...props} />;
}
