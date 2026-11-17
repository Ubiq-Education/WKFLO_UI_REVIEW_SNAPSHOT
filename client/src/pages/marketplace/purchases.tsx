import { useState } from "react";
import { useLocation } from "wouter";
import { ShoppingCart, ArrowLeft, Calendar, Download, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Mock data for purchased items
const mockPurchases = [
  {
    id: 1,
    name: "Email Automation Tool",
    vendor: "WorkflowPro",
    purchaseDate: "2024-10-01",
    price: "$29.99",
    status: "Active",
    category: "Productivity",
    nextBilling: "2024-11-01",
  },
  {
    id: 2,
    name: "Data Analytics Plugin",
    vendor: "DataViz Inc",
    purchaseDate: "2024-09-15",
    price: "Free",
    status: "Active",
    category: "Analytics",
    nextBilling: null,
  },
];

const mockSubscriptions = [
  {
    id: 1,
    name: "Premium Analytics Suite",
    vendor: "AdvancedData",
    plan: "Pro Plan",
    price: "$19.99/month",
    status: "Active",
    nextBilling: "2024-11-16",
    features: ["Advanced Analytics", "Custom Reports", "Priority Support"],
  },
];

export default function MyPurchases() {
  const [_, navigate] = useLocation();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-secondary">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/marketplace")}
          className="mr-3"
          aria-label="Back to marketplace"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ShoppingCart className="mr-3 h-6 w-6 text-green-500" />
        <h1 className="text-2xl font-semibold">My Purchases</h1>
      </div>

      <Tabs defaultValue="purchases" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="purchases">One-time Purchases</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="mt-6">
          <div className="space-y-4">
            {mockPurchases.map((purchase) => (
              <Card key={purchase.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{purchase.name}</CardTitle>
                      <p className="text-sm text-gray-500">by {purchase.vendor}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={purchase.status === "Active" ? "default" : "secondary"}>
                        {purchase.status}
                      </Badge>
                      <Badge variant="outline">{purchase.category}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Purchase Date</p>
                        <p className="text-sm text-gray-600">{purchase.purchaseDate}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Price Paid</p>
                      <p className="text-sm text-gray-600">{purchase.price}</p>
                    </div>
                    {purchase.nextBilling && (
                      <div>
                        <p className="text-sm font-medium">Next Billing</p>
                        <p className="text-sm text-gray-600">{purchase.nextBilling}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Re-download
                    </Button>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {mockPurchases.length === 0 && (
            <div className="text-center py-12">
              <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No purchases yet</h3>
              <p className="text-gray-500 mb-4">Browse the marketplace to find tools and plugins</p>
              <Button onClick={() => navigate("/marketplace/browse")}>
                Browse Marketplace
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6">
          <div className="space-y-4">
            {mockSubscriptions.map((subscription) => (
              <Card key={subscription.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{subscription.name}</CardTitle>
                      <p className="text-sm text-gray-500">by {subscription.vendor}</p>
                      <Badge variant="outline" className="mt-2">{subscription.plan}</Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={subscription.status === "Active" ? "default" : "secondary"}>
                        {subscription.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm font-medium">Monthly Price</p>
                      <p className="text-sm text-gray-600">{subscription.price}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Next Billing Date</p>
                      <p className="text-sm text-gray-600">{subscription.nextBilling}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-medium mb-2">Included Features</p>
                    <div className="flex flex-wrap gap-2">
                      {subscription.features.map((feature, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Manage Subscription
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {mockSubscriptions.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No active subscriptions</h3>
              <p className="text-gray-500 mb-4">Browse the marketplace to find subscription services</p>
              <Button onClick={() => navigate("/marketplace/browse")}>
                Browse Marketplace
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}