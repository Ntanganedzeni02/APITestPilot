import { AuthPage } from '../../../components/auth/auth-page';
export const metadata = { title: 'Reset password' };
export default function Reset(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage mode="reset" {...props} />;
}
