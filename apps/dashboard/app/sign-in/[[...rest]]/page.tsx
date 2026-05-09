import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <SignIn />
    </div>
  );
}
