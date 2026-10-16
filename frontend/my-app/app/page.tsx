export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-bold text-maroon-700 mb-4">BAEN Community</h1>
        <p className="text-xl text-gray-700 mb-10">
          Welcome. Please log in or create an account to continue.
        </p>

        <div className="flex flex-col gap-4">
          <a
            href="/login"
            className="w-full text-xl font-semibold bg-maroon-700 text-white rounded-md py-4 hover:bg-maroon-800"
          >
            Log In
          </a>
          <a
            href="/signup"
            className="w-full text-xl font-semibold bg-white text-maroon-700 border-2 border-maroon-700 rounded-md py-4 hover:bg-maroon-50"
          >
            Create an Account
          </a>
        </div>
      </div>
    </main>
  );
}
