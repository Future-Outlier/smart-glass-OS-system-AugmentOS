import {FC, createContext, useEffect, useState, useContext} from "react"

import {LogoutUtils} from "@/utils/LogoutUtils"
import {mentraAuthProvider} from "@/utils/auth/authProvider"
import {MentraAuthSession, MentraAuthUser} from "@/utils/auth/authProvider.types"

interface AuthContextProps {
  user: MentraAuthUser | null
  session: MentraAuthSession | null
  loading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextProps>({
  user: null,
  session: null,
  loading: true,
  logout: () => {},
})

export const AuthProvider: FC<{children: React.ReactNode}> = ({children}) => {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let subscription: {unsubscribe: () => void} | undefined

    // 1. Check for an active session on mount
    const getInitialSession = async () => {
      const {data: initialSessionData} = await mentraAuthProvider.getSession()
      const session = initialSessionData?.session
      console.log("AuthContext: Initial session:", session)
      console.log("AuthContext: Initial user:", session?.user)
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }

    // 2. Setup auth state change listener
    const setupAuthListener = async () => {
      try {
        const {data: authStateChangeData} = await mentraAuthProvider.onAuthStateChange((event, session: any) => {
          console.log("AuthContext: Auth state changed:", event)
          console.log("AuthContext: Session:", session)
          console.log("AuthContext: User:", session?.user)
          setSession(session)
          setUser(session?.user ?? null)
          setLoading(false)
        })

        if (authStateChangeData?.subscription) {
          subscription = authStateChangeData.subscription
        }
      } catch (error) {
        console.error("AuthContext: Error setting up auth listener:", error)
      }
    }

    // Run both initial checks
    getInitialSession().catch(error => {
      console.error("AuthContext: Error getting initial session:", error)
      setLoading(false)
    })

    setupAuthListener()

    // Cleanup the listener
    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const logout = async () => {
    console.log("AuthContext: Starting logout process")

    try {
      // Use the comprehensive logout utility
      await LogoutUtils.performCompleteLogout()

      // Verify logout was successful
      const logoutSuccessful = await LogoutUtils.verifyLogoutSuccess()
      if (!logoutSuccessful) {
        console.warn("AuthContext: Logout verification failed, but continuing...")
      }

      // Update local state
      setSession(null)
      setUser(null)

      console.log("AuthContext: Logout process completed")
    } catch (error) {
      console.error("AuthContext: Error during logout:", error)

      // Even if there's an error, clear local state to prevent user from being stuck
      setSession(null)
      setUser(null)
    }
  }

  const value: AuthContextProps = {
    user,
    session,
    loading,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
