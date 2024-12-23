import React from "react";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { messaging } from "linda-protocol";
import { toast } from "react-hot-toast";

const { channels } = messaging;

export default function Channels({ onSelect }) {
  const [myChannels, setMyChannels] = React.useState([]);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showSearchModal, setShowSearchModal] = React.useState(false);
  const [newChannelName, setNewChannelName] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState({
    boards: [],
    channels: [],
  });
  const [isChannel, setIsChannel] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [showMembersModal, setShowMembersModal] = React.useState(false);
  const [selectedChannel, setSelectedChannel] = React.useState(null);
  const [channelMembers, setChannelMembers] = React.useState([]);
  const [isLoadingMembers, setIsLoadingMembers] = React.useState(false);

  // Function to generate a unique key
  const generateUniqueKey = (channel) => {
    return `channel_${channel.id}_${channel.type}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;
  };

  // Load user's channels
  React.useEffect(() => {
    if (!user.is) return;

    let mounted = true;

    const loadChannels = async () => {
      try {
        const channelsList = new Map();
        let loadingPromises = [];

        // Parallel loading of channels
        await new Promise((resolve) => {
          gun
            .user()
            .get(DAPP_NAME)
            .get("my_channels")
            .map()
            .once(async (data) => {
              if (!data || !data.channelId) return;

              // Add each promise to the array
              loadingPromises.push(
                Promise.all([
                  channels.countMembers(data.channelId),
                  new Promise((resolveChannel) => {
                    gun
                      .get(DAPP_NAME)
                      .get("channels")
                      .get(data.channelId)
                      .once((channelData) => {
                        resolveChannel(channelData);
                      });
                  }),
                ]).then(([membersCount, channelData]) => {
                  if (channelData) {
                    channelsList.set(data.channelId, {
                      ...channelData,
                      id: data.channelId,
                      joined: data.joined || channelData.created || Date.now(),
                      membersCount,
                      uniqueKey: generateUniqueKey(channelData),
                    });
                  }
                })
              );
            });

          // Resolve after a shorter timeout
          setTimeout(resolve, 500);
        });

        // Wait for all channels to load
        await Promise.all(loadingPromises);

        if (mounted) {
          const channelsArray = Array.from(channelsList.values());
          setMyChannels(channelsArray.sort((a, b) => b.joined - a.joined));
        }
      } catch (error) {
        console.error("Error loading channels:", error);
        if (mounted) {
          toast.error("Error loading channels");
        }
      }
    };

    loadChannels();

    // Monitor changes in channels
    const channelsSubscription = gun
      .user()
      .get(DAPP_NAME)
      .get("my_channels")
      .map()
      .on(async (data) => {
        if (!mounted || !data || !data.channelId) return;

        try {
          const [membersCount, channel] = await Promise.all([
            channels.countMembers(data.channelId),
            new Promise((resolve) => {
              gun
                .get(DAPP_NAME)
                .get("channels")
                .get(data.channelId)
                .once((channelData) => {
                  resolve(channelData);
                });
            }),
          ]);

          if (channel) {
            setMyChannels((prev) => {
              const withoutCurrent = prev.filter(
                (c) => c.id !== data.channelId
              );
              const updatedChannel = {
                ...channel,
                id: data.channelId,
                joined: data.joined || channel.created || Date.now(),
                membersCount,
                uniqueKey: generateUniqueKey(channel),
              };
              return [...withoutCurrent, updatedChannel].sort(
                (a, b) => b.joined - a.joined
              );
            });
          }
        } catch (error) {
          console.error("Error updating channel:", error);
        }
      });

    return () => {
      mounted = false;
      if (typeof channelsSubscription === "function") {
        channelsSubscription();
      }
    };
  }, []);

  // Create new board/channel
  const handleCreate = async () => {
    if (!user.is) {
      toast.error("User not authenticated");
      return;
    }

    if (!newChannelName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setLoading(true);

    try {
      await channels.create(
        newChannelName.trim(),
        isChannel ? "channel" : "board"
      );

      toast.success(`${isChannel ? "Channel" : "Board"} created successfully!`);
      setNewChannelName("");
      setIsChannel(false);
      setShowCreateModal(false);

      if (!isChannel) {
        const boardId = `board_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        // Initialize both private and public nodes
        await Promise.all([
          gun.get(DAPP_NAME).get("boards").get(boardId).put({
            id: boardId,
            name: newChannelName.trim(),
            type: "board",
            creator: user.is.pub,
            created: Date.now(),
            messages: {},
          }),
          gun.get(DAPP_NAME).get("public_boards").get(boardId).put({
            id: boardId,
            name: newChannelName.trim(),
            type: "board",
            creator: user.is.pub,
            created: Date.now(),
            messages: {},
          }),
        ]);
      }
    } catch (error) {
      console.error("Error during creation:", error);
      toast.error(error.message || "Error during creation");
    } finally {
      setLoading(false);
    }
  };

  // Search boards and channels
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const results = await channels.search(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching:", error);
      toast.error("Error during search");
    } finally {
      setLoading(false);
    }
  };

  // Join a board/channel
  const handleJoin = async (channelId) => {
    try {
      await channels.join(channelId);
      toast.success("Successfully joined");
      setShowSearchModal(false);
    } catch (error) {
      console.error("Error joining:", error);
      toast.error(error.message);
    }
  };

  // View members
  const handleShowMembers = async (channel) => {
    setSelectedChannel(channel);
    setIsLoadingMembers(true);
    try {
      const members = await channels.getMembers(channel.id);
      setChannelMembers(members);
      setShowMembersModal(true);
    } catch (error) {
      console.error("Error loading members:", error);
      toast.error("Error loading members");
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Leave board/channel
  const handleLeave = async (channelId) => {
    if (window.confirm("Are you sure you want to leave this board?")) {
      try {
        await channels.leave(channelId);
        toast.success("Successfully left the board");
      } catch (error) {
        console.error("Error leaving board:", error);
        toast.error("Error leaving the board");
      }
    }
  };

  // Modify channel selection handling
  const handleChannelSelect = (channel) => {
    // Reset message state before switching channels
    onSelect({
      ...channel,
      roomId: channel.id,
      type: channel.type,
      name: channel.name,
      isGroup: false,
      pub: channel.id,
      timestamp: Date.now(), // Add timestamp to force refresh
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with buttons */}
      <div className="p-4 border-b space-y-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Create Board/Channel
        </button>
        <button
          onClick={() => setShowSearchModal(true)}
          className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Search Boards and Channels
        </button>
      </div>

      {/* List of boards and channels */}
      <div className="flex-1 overflow-y-auto">
        {myChannels.map((channel) => (
          <div
            key={channel.uniqueKey}
            className="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b"
          >
            <div
              className="flex-1 flex items-center"
              onClick={() => handleChannelSelect(channel)}
            >
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                {channel.type === "channel" ? "📢" : "📋"}
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium truncate">
                    {channel.name}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {channel.type === "channel" ? "Channel" : "Board"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {channel.membersCount || 0} members
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleShowMembers(channel);
                }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
                title="View members"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLeave(channel.id);
                }}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full"
                title="Leave board"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">
              Create new {isChannel ? "channel" : "board"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Enter a name..."
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isChannel}
                  onChange={(e) => setIsChannel(e.target.checked)}
                  className="mr-2"
                  disabled={loading}
                />
                <label className="text-sm text-gray-700">
                  Create as channel
                </label>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading || !newChannelName.trim()}
                  className={`px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 
                    ${
                      loading || !newChannelName.trim()
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <svg
                        className="animate-spin h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span>Creating...</span>
                    </div>
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">
              Search Boards and Channels
            </h3>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 px-3 py-2 border rounded-md"
                  placeholder="Search..."
                />
                <button
                  onClick={handleSearch}
                  disabled={loading || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  Search
                </button>
              </div>

              {/* Search results */}
              <div className="max-h-60 overflow-y-auto">
                {searchResults.boards.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50 border-b"
                  >
                    <div>
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-500">
                        {item.membersCount || 0} members •{" "}
                        {item.type === "channel" ? "Channel" : "Board"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleJoin(item.id)}
                      className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                    >
                      Join
                    </button>
                  </div>
                ))}
                {searchResults.channels.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-50 border-b"
                  >
                    <div>
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-500">
                        {item.membersCount || 0} members •{" "}
                        {item.type === "channel" ? "Channel" : "Board"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleJoin(item.id)}
                      className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                    >
                      Join
                    </button>
                  </div>
                ))}
                {searchResults.boards.length === 0 &&
                  searchResults.channels.length === 0 &&
                  searchQuery &&
                  !loading && (
                    <p className="text-center text-gray-500 py-4">
                      No results found
                    </p>
                  )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowSearchModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members modal */}
      {showMembersModal && selectedChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">
                Members - {selectedChannel.name}
              </h3>
              <button
                onClick={() => setShowMembersModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {isLoadingMembers ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg">
                  <div className="px-4 py-2 bg-gray-50 border-b">
                    <h4 className="font-medium">
                      Members ({channelMembers.length})
                    </h4>
                  </div>
                  <div className="divide-y">
                    {channelMembers.map((member) => (
                      <div key={member.pub} className="p-4 flex items-center">
                        <img
                          className="h-8 w-8 rounded-full mr-2"
                          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${member.username}&backgroundColor=b6e3f4`}
                          alt=""
                        />
                        <div>
                          <span className="font-medium">{member.username}</span>
                          {member.pub === selectedChannel.creator && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              Creator
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
