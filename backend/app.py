# ==============================================================================
# CSE 108 - Lab 8: Student Enrollment Web App
# Backend REST API, SQLAlchemy ORM Models, and Flask-Admin Interface.
# ==============================================================================

from flask import Flask, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_admin import Admin, AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from wtforms import FloatField
from wtforms.validators import InputRequired, ValidationError

# ==============================================================================
# 1. APPLICATION & DATABASE CONFIGURATION
# ==============================================================================
app = Flask(__name__)

# Secret key required by Flask-Admin for session management
app.config["SECRET_KEY"] = "acme-university-secret-key"

# Configure local SQLite database file
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///enrollment.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Enable CORS so the React development server (port 3000) can query Flask (port 5000)
CORS(app)

# Initialize SQLAlchemy ORM
db = SQLAlchemy(app)


# ==============================================================================
# 2. RELATIONAL DATABASE MODELS
# ==============================================================================
class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    # Role options: 'student', 'teacher', 'admin'
    role = db.Column(db.String(20), nullable=False)

    # Relationships
    courses_taught = db.relationship("Course", backref="teacher", lazy=True)
    enrollments = db.relationship("Enrollment", backref="student", cascade="all, delete-orphan", lazy=True)

    def __str__(self):
        return f"{self.full_name} ({self.username})"

    def __repr__(self):
        return f"<User {self.username} ({self.role})>"


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    time = db.Column(db.String(100), nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    # Relationships
    enrollments = db.relationship("Enrollment", backref="course", cascade="all, delete-orphan", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "teacher": self.teacher.full_name if self.teacher else "TBA",
            "teacher_id": self.teacher_id,
            "time": self.time,
            "enrolled_count": len(self.enrollments),
            "capacity": self.capacity
        }

    def __str__(self):
        return self.name

    def __repr__(self):
        return f"<Course {self.name}>"


class Enrollment(db.Model):
    __tablename__ = "enrollments"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
    grade = db.Column(db.Float, default=100.0, nullable=False)

    # Prevent duplicate enrollment in the same course
    __table_args__ = (db.UniqueConstraint("student_id", "course_id", name="_student_course_uc"),)

# ==============================================================================
# 3. FLASK-ADMIN CONFIGURATION (ADMIN ROLE CRUD)
# ==============================================================================
class MyAdminIndexView(AdminIndexView):
    @expose("/")
    def index(self):
        return redirect(url_for("users.index_view"))

    def is_visible(self):
        return False

class AcmeAdminView(ModelView):
    # Inject ACME University stylesheet across all admin pages
    extra_css = ["/static/admin_theme.css"]

class CourseAdminView(AcmeAdminView):
    # Hide the enrollments multi-select field on Create/Edit forms
    form_excluded_columns = ("enrollments",)

    form_args = {
        "teacher": {
            "query_factory": lambda: User.query.filter_by(role="teacher")
        }
    }

class UserAdminView(AcmeAdminView):
    # Hide reverse relationship fields on User Create/Edit forms
    form_excluded_columns = ("enrollments", "courses_taught")

    # Render 'role' as a dropdown menu instead of a free-text input
    form_choices = {
        "role": [
            ("student", "Student"),
            ("teacher", "Teacher"),
            ("admin", "Admin")
        ]
    }

class EnrollmentAdminView(AcmeAdminView):
    # Explicitly show Student, Course, and Grade columns in the list view
    column_list = ("student", "course", "grade")

    # Ensure Student, Course, and Grade appear on Create and Edit forms
    form_columns = ("student", "course", "grade")

    # Force Flask-Admin to render a numeric input for db.Float
    form_overrides = {
        "grade": FloatField
    }

    # Use InputRequired instead of DataRequired so entering 0.0 is valid
    form_args ={
        "student": {
            "query_factory": lambda: User.query.filter_by(role="student")
        },
        "grade": {
            "validators": [InputRequired()]
        }
    }

    def on_model_change(self, form, model, is_created):
        # Prevent SQLAlchemy from auto-flushing the pending duplicate row during the SELECT query
        with db.session.no_autoflush:
            existing = Enrollment.query.filter_by(
                student_id=model.student.id,
                course_id=model.course.id
            ).first()

        # Block if creating a duplicate, or if editing into an existing pair
        if existing and (is_created or existing.id != model.id):
            raise ValidationError(
                f"{model.student.full_name} is already enrolled in {model.course.name}."
            )

    def handle_view_exception(self, exc):
        if isinstance(exc, ValidationError):
            from flask import flash
            flash(str(exc), "error")
            return True
        return super().handle_view_exception(exc)

admin = Admin(app, name="ACME University Admin", index_view=MyAdminIndexView())
admin.add_view(UserAdminView(User, db.session, name="Users", endpoint="users", url="users"))
admin.add_view(CourseAdminView(Course, db.session, name="Courses", endpoint="courses", url="courses"))
admin.add_view(EnrollmentAdminView(Enrollment, db.session, name="Enrollments", endpoint="enrollments", url="enrollments"))


# ==============================================================================
# 4. AUTHENTICATION ENDPOINTS
# ==============================================================================
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or "username" not in data or "password" not in data:
        return jsonify({"error": "Username and password required"}), 400

    user = User.query.filter_by(username=data["username"], password=data["password"]).first()
    if not user:
        return jsonify({"error": "Invalid username or password"}), 401

    return jsonify({
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role
    }), 200


# ==============================================================================
# 5. STUDENT ROLE ENDPOINTS
# ==============================================================================
@app.route("/api/courses", methods=["GET"])
def get_all_courses():
    courses = Course.query.all()
    return jsonify([c.to_dict() for c in courses]), 200


@app.route("/api/students/<int:student_id>/courses", methods=["GET"])
def get_student_courses(student_id):
    enrollments = Enrollment.query.filter_by(student_id=student_id).all()
    result = []
    for e in enrollments:
        course_data = e.course.to_dict()
        course_data["grade"] = e.grade
        result.append(course_data)
    return jsonify(result), 200


@app.route("/api/enroll", methods=["POST"])
def enroll_student():
    data = request.get_json()
    student_id = data.get("student_id")
    course_id = data.get("course_id")

    course = Course.query.get(course_id)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    # Enforce maximum capacity limit
    if len(course.enrollments) >= course.capacity:
        return jsonify({"error": "Course has reached maximum capacity"}), 400

    # Check if already enrolled
    existing = Enrollment.query.filter_by(student_id=student_id, course_id=course_id).first()
    if existing:
        return jsonify({"error": "Already enrolled in this course"}), 409

    new_enrollment = Enrollment(student_id=student_id, course_id=course_id, grade=100.0)
    db.session.add(new_enrollment)
    db.session.commit()
    return jsonify({"message": "Successfully enrolled"}), 201


@app.route("/api/drop", methods=["DELETE"])
def drop_student():
    data = request.get_json()
    student_id = data.get("student_id")
    course_id = data.get("course_id")

    enrollment = Enrollment.query.filter_by(student_id=student_id, course_id=course_id).first()
    if not enrollment:
        return jsonify({"error": "Enrollment record not found"}), 404

    db.session.delete(enrollment)
    db.session.commit()
    return jsonify({"message": "Successfully dropped course"}), 200


# ==============================================================================
# 6. TEACHER ROLE ENDPOINTS
# ==============================================================================
@app.route("/api/teachers/<int:teacher_id>/courses", methods=["GET"])
def get_teacher_courses(teacher_id):
    courses = Course.query.filter_by(teacher_id=teacher_id).all()
    return jsonify([c.to_dict() for c in courses]), 200


@app.route("/api/courses/<int:course_id>/roster", methods=["GET"])
def get_course_roster(course_id):
    course = Course.query.get(course_id)
    if not course:
        return jsonify({"error": "Course not found"}), 404

    roster = []
    for e in course.enrollments:
        roster.append({
            "enrollment_id": e.id,
            "student_id": e.student.id,
            "student_name": e.student.full_name,
            "grade": e.grade
        })

    return jsonify({
        "course_name": course.name,
        "roster": roster
    }), 200


@app.route("/api/enrollments/<int:enrollment_id>/grade", methods=["PUT"])
def update_student_grade(enrollment_id):
    enrollment = Enrollment.query.get(enrollment_id)
    if not enrollment:
        return jsonify({"error": "Enrollment not found"}), 404

    data = request.get_json()
    try:
        enrollment.grade = float(data["grade"])
    except (ValueError, TypeError, KeyError):
        return jsonify({"error": "Valid numeric grade required"}), 400

    db.session.commit()
    return jsonify({"message": "Grade updated", "grade": enrollment.grade}), 200


# ==============================================================================
# 7. DATABASE SEEDER FOR PRESENTING
# ==============================================================================
def seed_data():
    if User.query.count() > 0:
        return

    # Create Teachers
    t_walker = User(username="swalker", password="password", full_name="Susan Walker", role="teacher")
    t_hepworth = User(username="ahepworth", password="password", full_name="Ammon Hepworth", role="teacher")
    t_jenkins = User(username="rjenkins", password="password", full_name="Ralph Jenkins", role="teacher")

    # Create Admin
    admin_user = User(username="admin", password="adminpassword", full_name="Admin", role="admin")

    # Create Students
    s_chuck = User(username="cnorris", password="password", full_name="Chuck Norris", role="student")
    s_mindy = User(username="mkaling", password="password", full_name="Mindy Kaling", role="student")
    s_aditya = User(username="aranganath", password="password", full_name="Aditya Ranganath", role="student")
    s_nancy = User(username="nlittle", password="password", full_name="Nancy Little", role="student")
    s_yi = User(username="ychen", password="password", full_name="Yi Wen Chen", role="student")
    s_john = User(username="jstuart", password="password", full_name="John Stuart", role="student")

    db.session.add_all([t_walker, t_hepworth, t_jenkins, admin_user, s_chuck, s_mindy, s_aditya, s_nancy, s_yi, s_john])
    db.session.commit()

    # Create Courses
    c_phys = Course(name="PHYS 121", time="TTh 11:00-11:50 AM", capacity=10, teacher_id=t_walker.id)
    c_cse108 = Course(name="CSE 108", time="MWF 2:00-2:50 PM", capacity=10, teacher_id=t_hepworth.id)
    c_math = Course(name="MATH 101", time="MWF 10:00-10:50 AM", capacity=8, teacher_id=t_jenkins.id)
    c_cse162 = Course(name="CSE 162", time="TTh 3:00-3:50 PM", capacity=4, teacher_id=t_hepworth.id)

    db.session.add_all([c_phys, c_cse108, c_math, c_cse162])
    db.session.commit()

    # Create Initial Enrollments (Makes CSE 162 full at 4/4 capacity)
    enrollments = [
        Enrollment(student_id=s_chuck.id, course_id=c_phys.id, grade=88.0),
        Enrollment(student_id=s_chuck.id, course_id=c_cse108.id, grade=94.0),
        Enrollment(student_id=s_aditya.id, course_id=c_cse162.id, grade=92.0),
        Enrollment(student_id=s_nancy.id, course_id=c_cse162.id, grade=78.0),
        Enrollment(student_id=s_yi.id, course_id=c_cse162.id, grade=95.0),
        Enrollment(student_id=s_john.id, course_id=c_cse162.id, grade=76.0)
    ]

    db.session.add_all(enrollments)
    db.session.commit()


# ==============================================================================
# 8. ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        seed_data()

    app.run(host="0.0.0.0", port=5000, debug=True)