import React, { useState, useEffect } from "react";
import "./App.css";

const API_BASE = "http://localhost:5000/api";

// ==============================================================================
// MAIN APPLICATION COMPONENT
// ==============================================================================
function App()
{
  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");

  // Dynamically update the browser tab title based on login state
  useEffect(() =>
  {
    if (!currentUser)
    {
      document.title = "ACME University - Sign In";
    }
    else
    {
      document.title = `ACME University - ${currentUser.full_name}`;
    }
  }, [currentUser]);
  
  // Handle user sign-out
  const handleSignOut = () =>
  {
    setCurrentUser(null);
    setStatusMessage("");
  };

  // Render Login Screen if no user is authenticated
  if (!currentUser)
  {
    return (
      <LoginScreen
        onLoginSuccess={(user) => setCurrentUser(user)}
        statusMessage={statusMessage}
        setStatusMessage={setStatusMessage}
      />
    );
  }

  // Render Authenticated Header + Role-Specific Dashboard
  return (
    <div className="app-wrapper">
      {/* Top Navigation Banner */}
      <header className="top-banner">
        <div className="welcome-text">
          Welcome {currentUser.role === "teacher" ? `Dr. ${currentUser.full_name.split(" ").pop()}` : currentUser.full_name.split(" ")[0]}!
        </div>
        <h1 className="university-title">ACME University</h1>
        <button className="signout-link" onClick={handleSignOut}>
          Sign out
        </button>
      </header>

      {/* Notification Banner */}
      {statusMessage && (
        <div className="notification-bar">
          {statusMessage}
        </div>
      )}

      {/* Role Router */}
      <main className="main-container">
        {currentUser.role === "student" && (
          <StudentDashboard
            user={currentUser}
            setStatusMessage={setStatusMessage}
          />
        )}

        {currentUser.role === "teacher" && (
          <TeacherDashboard
            user={currentUser}
            setStatusMessage={setStatusMessage}
          />
        )}

        {currentUser.role === "admin" && (
          <AdminDashboard />
        )}
      </main>
    </div>
  );
}


// ==============================================================================
// 1. LOGIN SCREEN COMPONENT
// ==============================================================================
function LoginScreen({ onLoginSuccess, statusMessage, setStatusMessage })
{
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Submit credentials to Flask /api/login
  const handleSubmit = async (e) =>
  {
    e.preventDefault();
    setStatusMessage("");

    try
    {
      const response = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok)
      {
        setStatusMessage(data.error || "Login failed");
        return;
      }

      onLoginSuccess(data);
    }
    catch (err)
    {
      setStatusMessage("Unable to reach backend server.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>ACME University</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn-signin">
            Sign in
          </button>
        </form>

        {statusMessage && <p className="error-text">{statusMessage}</p>}
      </div>
    </div>
  );
}


// ==============================================================================
// 2. STUDENT DASHBOARD COMPONENT
// ==============================================================================
function StudentDashboard({ user, setStatusMessage })
{
  // Active tab: 'my-courses' or 'add-courses'
  const [activeTab, setActiveTab] = useState("my-courses");
  const [myCourses, setMyCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);

  // Fetch both enrolled courses and full school catalog
  const refreshData = async () =>
  {
    try
    {
      const [myRes, allRes] = await Promise.all([
        fetch(`${API_BASE}/students/${user.id}/courses`),
        fetch(`${API_BASE}/courses`)
      ]);

      const myData = await myRes.json();
      const allData = await allRes.json();

      setMyCourses(myData);
      setAllCourses(allData);
    }
    catch (err)
    {
      setStatusMessage("Error loading course data.");
    }
  };

  useEffect(() =>
  {
    refreshData();
  }, [user.id]);

  // Sign up for a course (+)
  const handleEnroll = async (courseId) =>
  {
    try
    {
      const res = await fetch(`${API_BASE}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: user.id, course_id: courseId })
      });

      const data = await res.json();
      if (!res.ok)
      {
        setStatusMessage(data.error);
        return;
      }

      setStatusMessage("Enrolled in course!");
      refreshData();
    }
    catch (err)
    {
      setStatusMessage("Enrollment request failed.");
    }
  };

  // Drop an enrolled course (-)
  const handleDrop = async (courseId) =>
  {
    try
    {
      const res = await fetch(`${API_BASE}/drop`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: user.id, course_id: courseId })
      });

      const data = await res.json();
      if (!res.ok)
      {
        setStatusMessage(data.error);
        return;
      }

      setStatusMessage("Dropped course.");
      refreshData();
    }
    catch (err)
    {
      setStatusMessage("Drop request failed.");
    }
  };

  // Helper to check if current student is enrolled in a given course ID
  const isEnrolled = (courseId) =>
  {
    return myCourses.some((c) => c.id === courseId);
  };

  return (
    <div className="portal-panel">
      {/* Tab Header */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "my-courses" ? "active" : ""}`}
          onClick={() => setActiveTab("my-courses")}
        >
          Your Courses
        </button>
        <button
          className={`tab-btn ${activeTab === "add-courses" ? "active" : ""}`}
          onClick={() => setActiveTab("add-courses")}
        >
          Add Courses
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="panel-body">
        {activeTab === "my-courses" ? (
          <table className="acme-table">
            <thead>
              <tr>
                <th>Course Name</th>
                <th>Teacher</th>
                <th>Time</th>
                <th>Students Enrolled</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {myCourses.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-cell">You are not enrolled in any courses.</td>
                </tr>
              ) : (
                myCourses.map((course) => (
                  <tr key={course.id}>
                    <td>{course.name}</td>
                    <td>{course.teacher}</td>
                    <td>{course.time}</td>
                    <td>{course.enrolled_count}/{course.capacity}</td>
                    <td>
                      <span className="grade-badge">
                        {course.grade !== null && course.grade !== undefined ? `${course.grade}%` : "N/A"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="acme-table">
            <thead>
              <tr>
                <th>Course Name</th>
                <th>Teacher</th>
                <th>Time</th>
                <th>Students Enrolled</th>
                <th>Add / Drop</th>
              </tr>
            </thead>
            <tbody>
              {allCourses.map((course) =>
              {
                const enrolled = isEnrolled(course.id);
                const isFull = course.enrolled_count >= course.capacity;

                return (
                  <tr key={course.id}>
                    <td>{course.name}</td>
                    <td>{course.teacher}</td>
                    <td>{course.time}</td>
                    <td>{course.enrolled_count}/{course.capacity}</td>
                    <td className="action-cell">
                      {enrolled ? (
                        <button
                          className="btn-drop"
                          title="Drop Course"
                          onClick={() => handleDrop(course.id)}
                        >
                          &minus;
                        </button>
                      ) : !isFull ? (
                        <button
                          className="btn-add"
                          title="Add Course"
                          onClick={() => handleEnroll(course.id)}
                        >
                          +
                        </button>
                      ) : (
                        <span className="full-badge">Full</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// ==============================================================================
// 3. TEACHER DASHBOARD COMPONENT
// ==============================================================================
function TeacherDashboard({ user, setStatusMessage })
{
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [roster, setRoster] = useState([]);
  const [gradeInputs, setGradeInputs] = useState({});

  // Load courses taught by this instructor
  const fetchTeacherCourses = async () =>
  {
    try
    {
      const res = await fetch(`${API_BASE}/teachers/${user.id}/courses`);
      const data = await res.json();
      setCourses(data);
    }
    catch (err)
    {
      setStatusMessage("Failed to load taught courses.");
    }
  };

  useEffect(() =>
  {
    fetchTeacherCourses();
  }, [user.id]);

  // Open roster view for a clicked course
  const handleSelectCourse = async (course) =>
  {
    try
    {
      const res = await fetch(`${API_BASE}/courses/${course.id}/roster`);
      const data = await res.json();

      setSelectedCourse(course);
      setRoster(data.roster);

      // Initialize editable grade input state
      const initialGrades = {};
      data.roster.forEach((student) =>
      {
        initialGrades[student.enrollment_id] = student.grade;
      });
      setGradeInputs(initialGrades);
    }
    catch (err)
    {
      setStatusMessage("Failed to load course roster.");
    }
  };

  // Save updated grade for a student
  const handleSaveGrade = async (enrollmentId) =>
  {
    const updatedGrade = gradeInputs[enrollmentId];

    try
    {
      const res = await fetch(`${API_BASE}/enrollments/${enrollmentId}/grade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: parseFloat(updatedGrade) })
      });

      if (!res.ok)
      {
        setStatusMessage("Invalid grade value.");
        return;
      }

      setStatusMessage("Grade updated successfully!");
    }
    catch (err)
    {
      setStatusMessage("Failed to save grade.");
    }
  };

  // View B: Specific Course Roster & Editable Grades
  if (selectedCourse)
  {
    return (
      <div className="portal-panel">
        <div className="single-header">
          <button
            className="btn-back"
            onClick={() =>
            {
              setSelectedCourse(null);
              fetchTeacherCourses();
            }}
          >
            &larr; Back
          </button>
          <span>{selectedCourse.name}</span>
          <span style={{ width: "60px" }}></span>
        </div>

        <div className="panel-body">
          <table className="acme-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Grade</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr>
                  <td colSpan="3" className="empty-cell">No students enrolled yet.</td>
                </tr>
              ) : (
                roster.map((entry) => (
                  <tr key={entry.enrollment_id}>
                    <td>{entry.student_name}</td>
                    <td>
                      <input
                        type="number"
                        step="0.1"
                        className="grade-input"
                        value={gradeInputs[entry.enrollment_id] ?? ""}
                        onChange={(e) =>
                          setGradeInputs({
                            ...gradeInputs,
                            [entry.enrollment_id]: e.target.value
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="btn-save-grade"
                        onClick={() => handleSaveGrade(entry.enrollment_id)}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // View A: List of Courses Taught
  return (
    <div className="portal-panel">
      <div className="single-header">
        <span>Your Courses</span>
      </div>

      <div className="panel-body">
        <table className="acme-table">
          <thead>
            <tr>
              <th>Course Name</th>
              <th>Teacher</th>
              <th>Time</th>
              <th>Students Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => (
              <tr key={course.id}>
                <td>
                  <button
                    className="course-link-btn"
                    onClick={() => handleSelectCourse(course)}
                  >
                    {course.name}
                  </button>
                </td>
                <td>{course.teacher}</td>
                <td>{course.time}</td>
                <td>{course.enrolled_count}/{course.capacity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ==============================================================================
// 4. ADMIN DASHBOARD COMPONENT
// ==============================================================================
function AdminDashboard()
{
  return (
    <div className="portal-panel">
      <div className="single-header">
        <span>Database Administration (Flask-Admin)</span>
      </div>

      <div className="panel-body admin-box">
        <p>
          Administrator access to Users, Courses, and Enrollments is hosted on the Flask-Admin portal.
        </p>
        <a
          href="http://localhost:5000/admin"
          target="_blank"
          rel="noreferrer"
          className="btn-admin-launch"
        >
          Open Flask-Admin Console
        </a>
      </div>
    </div>
  );
}

export default App;