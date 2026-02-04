import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, CheckCircle, AlertCircle, Info } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";

/**
 * Store Guidelines page with placeholder content.
 * Full guidelines content will be hosted on docs.mentraglass.com.
 */
const StoreGuidelines: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Mentra MiniApp Store Guidelines
            </h1>
            <p className="text-gray-500 mt-1">
              Requirements and best practices for publishing MiniApps
            </p>
          </div>
          <Button variant="outline" asChild>
            <a
              href="https://docs.mentraglass.com/publishing/guidelines"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="h-4 w-4 mr-2" />
              Full Documentation
              <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        </div>

        <div className="space-y-6">
          {/* Overview Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                Overview
              </CardTitle>
              <CardDescription>
                Understanding the Mentra MiniApp Store review process
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Before your MiniApp can be published to the Mentra MiniApp Store,
                it must go through our review process. This ensures all MiniApps
                meet our quality standards and provide a great experience for
                MentraOS users.
              </p>
              <p className="text-gray-600">
                The review process typically takes 1-3 business days. You&apos;ll
                receive email notifications about your submission status.
              </p>
            </CardContent>
          </Card>

          {/* Requirements Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Requirements Checklist
              </CardTitle>
              <CardDescription>
                Ensure your MiniApp meets these requirements before submitting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    <strong>Accurate metadata:</strong> Display name, description,
                    and logo accurately represent your MiniApp&apos;s functionality
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    <strong>Working server:</strong> Your Server URL must be
                    reachable and respond to health checks
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    <strong>Required permissions:</strong> Only request permissions
                    that are necessary for your MiniApp&apos;s core functionality
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    <strong>Organization profile:</strong> Complete your
                    organization profile with a valid contact email
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    <strong>Preview images:</strong> Include at least one preview
                    image showing your MiniApp in use (recommended)
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Common Rejections Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Common Rejection Reasons
              </CardTitle>
              <CardDescription>
                Avoid these issues to speed up your review
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    Server URL is unreachable or returns errors
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    Description doesn&apos;t accurately describe functionality
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    Logo is missing, low quality, or not representative
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    Requesting unnecessary permissions
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-gray-600">
                    MiniApp crashes or doesn&apos;t respond to webhook events
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Help Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Info className="h-6 w-6 text-blue-500 shrink-0" />
                <div>
                  <h3 className="font-medium text-blue-900 mb-1">
                    Need Help?
                  </h3>
                  <p className="text-blue-800 text-sm mb-3">
                    For detailed guidelines, best practices, and troubleshooting,
                    visit our comprehensive documentation.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href="https://docs.mentraglass.com/publishing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 border-blue-300 hover:bg-blue-100"
                    >
                      View Publishing Guide
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default StoreGuidelines;
