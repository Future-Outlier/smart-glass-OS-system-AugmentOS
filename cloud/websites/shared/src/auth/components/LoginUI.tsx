import {useState} from "react"
import {supabase} from "../utils/supabase"
import {Button} from "../components/ui/button"
import EmailAuthModal from "./EmailAuthModal"
import {FcGoogle} from "react-icons/fc"
import {FaApple} from "react-icons/fa"

interface LoginUIProps {
  /** Logo image URL */
  logoUrl?: string
  /** Site name to display below logo */
  siteName: string
  /** Optional message to display above sign-in options */
  message?: string
  /** Redirect path after successful authentication */
  redirectTo: string
  /** Email modal redirect path */
  emailRedirectPath: string
  /** Email modal open state */
  isEmailModalOpen: boolean
  /** Email modal state setter */
  setIsEmailModalOpen: (open: boolean) => void
}

export const LoginUI: React.FC<LoginUIProps> = ({
  logoUrl = "https://imagedelivery.net/nrc8B2Lk8UIoyW7fY8uHVg/757b23a3-9ec0-457d-2634-29e28f03fe00/verysmall",
  siteName,
  message,
  redirectTo,
  emailRedirectPath,
  isEmailModalOpen,
  setIsEmailModalOpen,
}) => {
  const [isSignUp, setIsSignUp] = useState(false)

  const handleForgotPassword = () => {
    setIsEmailModalOpen(false)
    window.location.href = "/forgot-password"
  }
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={{width: "100%"}}>
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8" style={{maxWidth: "100%"}}>
        <div className="w-full max-w-md mx-auto flex flex-col items-center" style={{maxWidth: "28rem"}}>
          <img src={logoUrl} alt="Mentra Logo" />

          <div className="w-full text-center mt-6 mb-6">
            <h1 className="text-2xl font-bold mb-2">Welcome to the MentraOS {siteName}</h1>
            <p className="text-sm text-gray-500 mt-1">Choose your preferred sign in method</p>
            {message && <p className="mt-4 text-sm text-blue-600 bg-blue-50 p-3 rounded-md">{message}</p>}
          </div>

          {/* --- Login Card --- */}
          <div className="w-full bg-white p-8 rounded-lg shadow-md flex flex-col items-center">
            <div className="w-full space-y-4">
              {/* Social Provider Sign In */}
              <div className="w-full space-y-3">
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  onClick={async () => {
                    const {error} = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: redirectTo,
                        queryParams: {
                          access_type: "offline",
                          prompt: "consent",
                        },
                      },
                    })
                    if (error) console.error("Google sign in error:", error)
                  }}>
                  <FcGoogle className="w-5 h-5" />
                  Continue with Google
                </Button>
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  onClick={async () => {
                    const {error} = await supabase.auth.signInWithOAuth({
                      provider: "apple",
                      options: {
                        redirectTo: redirectTo,
                      },
                    })
                    if (error) console.error("Apple sign in error:", error)
                  }}>
                  <FaApple className="w-5 h-5" />
                  Continue with Apple
                </Button>
              </div>

              {/* Email Sign In Divider and Button */}
              <div className="w-full flex flex-col items-center space-y-4 mt-4">
                <div className="relative flex items-center w-full">
                  <div className="flex-1 border-t border-gray-300"></div>
                  <span className="px-4 text-sm text-gray-500">or</span>
                  <div className="flex-1 border-t border-gray-300"></div>
                </div>

                <Button
                  className="w-full py-2"
                  onClick={() => {
                    setIsSignUp(false)
                    setIsEmailModalOpen(true)
                  }}
                  variant="outline">
                  Sign in with Email
                </Button>
              </div>
            </div>

            <div className="text-center text-sm text-gray-500 mt-6">
              <p>By signing in, you agree to our Terms of Service and Privacy Policy.</p>
            </div>

            <div className="text-center text-sm text-gray-500 mt-6">
              <p
                onClick={() => {
                  setIsSignUp(true)
                  setIsEmailModalOpen(true)
                }}
                className="cursor-pointer underline">
                Do not have an account? Sign up
              </p>
            </div>

            {!isSignUp && (
              <div className="text-right text-sm text-gray-500 mt-4">
                <button type="button" onClick={handleForgotPassword} className="cursor-pointer underline">
                  Forgot Password?
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Email Auth Modal */}
      <EmailAuthModal
        open={isEmailModalOpen}
        onOpenChange={setIsEmailModalOpen}
        redirectPath={emailRedirectPath}
        isSignUp={isSignUp}
        setIsSignUp={setIsSignUp}
        onForgotPassword={() => {
          setIsEmailModalOpen(false)
          window.location.href = "/forgot-password"
        }}
      />
    </div>
  )
}
