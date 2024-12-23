import React from "react";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { userUtils } from "linda-protocol";
import { acceptFriendRequest, rejectFriendRequest } from "linda-protocol";
import { toast } from "react-hot-toast";

const FriendRequest = ({ request, onRequestProcessed }) => {
  const [userInfo, setUserInfo] = React.useState({
    displayName: "Loading...",
    username: "",
    nickname: "",
  });
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    const loadUserInfo = async () => {
      const info = await userUtils.getUserInfo(request.from);
      setUserInfo(info);
    };
    loadUserInfo();
  }, [request.from]);

  const handleAccept = async () => {
    try {
      setIsProcessing(true);
      const result = await acceptFriendRequest(request);

      if (result.success) {
        // Immediately remove the request from UI
        onRequestProcessed(request.from);

        // Remove the request from Gun
        gun
          .get(DAPP_NAME)
          .get("all_friend_requests")
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun.get(DAPP_NAME).get("all_friend_requests").get(key).put(null);
            }
          });

        gun
          .get(DAPP_NAME)
          .get("friend_requests")
          .get(user.is.pub)
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun
                .get(DAPP_NAME)
                .get("friend_requests")
                .get(user.is.pub)
                .get(key)
                .put(null);
            }
          });

        toast.success("Friend request accepted");
      }
    } catch (error) {
      console.error("Error accepting request:", error);
      toast.error("Error accepting the request");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      await rejectFriendRequest(request);

      // Immediately remove the request from UI
      onRequestProcessed(request.from);

      // Remove the request from Gun
      gun
        .get(DAPP_NAME)
        .get("all_friend_requests")
        .map()
        .once((data, key) => {
          if (data && data.from === request.from) {
            gun.get(DAPP_NAME).get("all_friend_requests").get(key).put(null);
          }
        });

      gun
        .get(DAPP_NAME)
        .get("friend_requests")
        .get(user.is.pub)
        .map()
        .once((data, key) => {
          if (data && data.from === request.from) {
            gun
              .get(DAPP_NAME)
              .get("friend_requests")
              .get(user.is.pub)
              .get(key)
              .put(null);
          }
        });

      toast.success("Friend request rejected");
    } catch (error) {
      console.error("Error rejecting request:", error);
      toast.error("Error rejecting the request");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm mb-2">
      <div className="flex items-center">
        <img
          className="h-10 w-10 rounded-full"
          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
          alt=""
        />
        <div className="ml-3">
          <p className="text-sm font-medium text-gray-900">
            {userInfo.displayName}
          </p>
          {userInfo.username && (
            <p className="text-xs text-gray-500">@{userInfo.username}</p>
          )}
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleAccept}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isProcessing ? "Processing..." : "Accept"}
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Reject
        </button>
      </div>
    </div>
  );
};

export default FriendRequest;
